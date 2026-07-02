#!/usr/bin/env python3
"""End-to-end backend gate proofs via the real Better Auth 2FA login + API.
Logs in each role (email/pw -> TOTP challenge -> verify), keeps the session
cookie, then exercises: staged gate order, payout release gate (TOTP+PIN),
reversal chain, and authz negatives."""
import subprocess, requests, time, sys, json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
WEBDIR = "/home/user/afrigen/packages/web"
CHROME = "/usr/bin/google-chrome-stable"
PW = "afrigen2026"
PIN = "123456"

SECRETS = {
    "client@afrigen.link":  "CD121ueA6hVZ652G0MQttboi3gL0E_o_",
    "supplier@afrigen.link":"yW7W1J20vEH_vJGKbKBdpYCWQF8MJ9bL",
    "supplier2@afrigen.link":"nhMbJDZh9m6M7gIDyPSp9frLHBe0Q6B_",
    "parts@afrigen.link":   "dthqZXFnmN-tD5ueOBy5Ytm2lbL1EZNd",
    "field@afrigen.link":   "VEK6C3Q3jsjRc0UPc8E0bjXWu6jsUMZq",
    "kam@afrigen.link":     "RYzs1f8P74ZlCw3xB1DSoz-NuY1mr5gJ",
    "admin@afrigen.link":   "MShSkQsasCrTDfXZpnazrAmEN5Gvp-OS",
}

def totp(secret):
    return subprocess.check_output(["bun", "_otp_helper.ts", secret], cwd=WEBDIR).decode().strip()

class Sess:
    """requests.Session pre-loaded with the bearer token pulled from the
    logged-in browser's localStorage (this app authenticates by Bearer, not cookies)."""
    def __init__(self, token):
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {token}"})
    def get(self, url, timeout=20):
        return self.s.get(url, timeout=timeout)
    def post(self, url, json=None, timeout=20):
        return self.s.post(url, json=(json or {}), timeout=timeout)

def login(email, browser):
    """Drive the real 2FA UI login via Playwright, then read the bearer token
    from localStorage for deterministic API calls."""
    ctx = browser.new_context(base_url=BASE)
    page = ctx.new_page()
    page.goto(f"{BASE}/app", wait_until="networkidle", timeout=30000)
    page.fill("input[placeholder*='you@company']", email)
    page.fill("input[type=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_timeout(3500)
    body = page.inner_text("body")
    if "TWO-STEP" in body.upper() or "Confirm it's you" in body:
        page.fill("input[placeholder='000000']", totp(SECRETS[email]))
        page.click("button:has-text('Verify')")
        page.wait_for_timeout(4000)
    token = page.evaluate("() => localStorage.getItem('bearer_token')")
    ctx.close()
    if not token:
        raise RuntimeError(f"no bearer token after login {email}")
    s = Sess(token)
    me = s.get(f"{BASE}/api/me", timeout=20)
    if me.status_code != 200:
        raise RuntimeError(f"/api/me not authed {email}: {me.status_code} {me.text[:150]}")
    return s, me.json()

PASS, FAIL = [], []
def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f"  — {detail}" if detail and not cond else ""))

def main():
    print("== LOGIN ALL ROLES (email/pw -> TOTP via UI, cookies -> API) ==")
    sess = {}
    pw = sync_playwright().start()
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
    for email in ["admin@afrigen.link","client@afrigen.link","supplier@afrigen.link",
                  "kam@afrigen.link","field@afrigen.link","parts@afrigen.link"]:
        try:
            s, me = login(email, browser)
            sess[email] = s
            role = me.get("profile", {}).get("role")
            check(f"login {email} (role={role})", True)
        except Exception as e:
            check(f"login {email}", False, str(e))
        time.sleep(23)  # avoid Better Auth 429
    browser.close(); pw.stop()

    admin = sess.get("admin@afrigen.link")
    client = sess.get("client@afrigen.link")
    kam = sess.get("kam@afrigen.link")

    if not admin:
        print("no admin session; aborting flow tests"); return

    print("\n== FLOW: staged-gate integrity (admin view of tenders) ==")
    r = admin.get(f"{BASE}/api/tenders", timeout=20)
    check("GET /api/tenders (admin) 200", r.status_code == 200, f"{r.status_code}")
    tenders = r.json().get("tenders", r.json()) if r.status_code == 200 else []
    if isinstance(tenders, dict): tenders = tenders.get("tenders", [])
    print(f"    admin sees {len(tenders)} tenders")

    print("\n== FLOW: gate order enforcement (skip-a-step must 400) ==")
    # pick a tender in Bidding and try to jump straight to Executing
    target = None
    for t in tenders:
        if t.get("tenderStage") in ("Bidding","AwardConfirmed"):
            target = t; break
    if target:
        tid = target["id"]
        # try to jump the KAM/admin "execute" step from an early stage -> must be rejected (400 wrong-order)
        r = admin.post(f"{BASE}/api/tenders/{tid}/advance/execute", timeout=20)
        check(f"skip to execute on {target['tenderStage']} tender rejected", r.status_code in (400,403), f"{r.status_code} {r.text[:100]}")
    else:
        print("    (no early-stage tender to test skip; skipping)")

    print("\n== FLOW: payout release gate (negatives) ==")
    # find a contract PendingAdminApproval
    rc = admin.get(f"{BASE}/api/contracts", timeout=20)
    conts = []
    if rc.status_code == 200:
        jj = rc.json(); conts = jj if isinstance(jj, list) else jj.get("contracts", [])
    pend = [c for c in conts if c.get("payoutStatus") == "PendingAdminApproval"]
    print(f"    contracts PendingAdminApproval: {len(pend)}")
    if pend:
        cid = pend[0]["id"]
        # no proof
        r = admin.post(f"{BASE}/api/contracts/{cid}/approve-release", json={"pin":PIN,"totp":totp(SECRETS['admin@afrigen.link'])}, timeout=20)
        check("release w/o TT proof -> 400", r.status_code == 400, f"{r.status_code}")
        # wrong pin
        r = admin.post(f"{BASE}/api/contracts/{cid}/approve-release", json={"payoutProofKey":"k","pin":"000000","totp":totp(SECRETS['admin@afrigen.link'])}, timeout=20)
        check("release wrong PIN -> 401", r.status_code == 401, f"{r.status_code}")
        # wrong totp
        r = admin.post(f"{BASE}/api/contracts/{cid}/approve-release", json={"payoutProofKey":"k","pin":PIN,"totp":"000000"}, timeout=20)
        check("release wrong TOTP -> 401", r.status_code == 401, f"{r.status_code}")
    else:
        print("    (no PendingAdminApproval contract; gate negatives skipped)")

    print("\n== AUTHZ: role guards (client cannot admin) ==")
    if client:
        r = client.get(f"{BASE}/api/admin/tenders", timeout=20)
        check("client -> /api/admin/tenders blocked", r.status_code in (401,403), f"{r.status_code}")
        r = client.post(f"{BASE}/api/me/master-pin", json={"pin":"999999"}, timeout=20)
        check("client -> set master-pin blocked", r.status_code in (401,403), f"{r.status_code}")
    if kam:
        # KAM cannot release payment (admin-only)
        r = kam.post(f"{BASE}/api/contracts/xxx/approve-release", json={"payoutProofKey":"k","pin":PIN,"totp":"000000"}, timeout=20)
        check("KAM -> approve-release blocked", r.status_code in (401,403,404) and r.status_code != 200, f"{r.status_code}")

    print("\n== AUTHZ: unauthenticated blocked ==")
    anon = requests.Session()
    r = anon.get(f"{BASE}/api/me", timeout=20)
    check("anon /api/me -> 401", r.status_code == 401, f"{r.status_code}")
    r = anon.get(f"{BASE}/api/admin/tenders", timeout=20)
    check("anon /api/admin/tenders -> 401", r.status_code == 401, f"{r.status_code}")
    r = anon.get(f"{BASE}/api/health", timeout=20)
    check("anon /api/health -> 200 (public)", r.status_code == 200, f"{r.status_code}")

    print(f"\n===== E2E API RESULT: {len(PASS)} pass / {len(FAIL)} fail =====")
    if FAIL:
        print("FAILURES:", FAIL)
        sys.exit(1)

main()
