import sys, time, re, subprocess, os
from playwright.sync_api import sync_playwright

WEBDIR = "/home/user/afrigen/packages/web"

def totp(secret):
    out = subprocess.check_output(
        ["bun", "_otp_helper.ts", secret], cwd=WEBDIR)
    return out.decode().strip()

BASE = "http://localhost:4200"
CHROME = "/usr/bin/google-chrome-stable"
PW = "afrigen2026"

# Real enrolled TOTP secrets (decrypted from DB) — proves the true 2FA login challenge.
SECRETS = {
    "client@afrigen.link":  "CD121ueA6hVZ652G0MQttboi3gL0E_o_",
    "supplier@afrigen.link":"yW7W1J20vEH_vJGKbKBdpYCWQF8MJ9bL",
    "parts@afrigen.link":   "dthqZXFnmN-tD5ueOBy5Ytm2lbL1EZNd",
    "field@afrigen.link":   "VEK6C3Q3jsjRc0UPc8E0bjXWu6jsUMZq",
    "kam@afrigen.link":     "RYzs1f8P74ZlCw3xB1DSoz-NuY1mr5gJ",
    "admin@afrigen.link":   "MShSkQsasCrTDfXZpnazrAmEN5Gvp-OS",
}
SECTIONS = {
    "client":   ["/app", "/app/new", "/app/ledger"],
    "supplier": ["/app", "/app/fleet", "/app/payments", "/app/ledger", "/app/breakdown", "/app/profile"],
    "parts":    ["/app", "/app/inventory", "/app/history", "/app/billing", "/app/ledger"],
    "field":    ["/app", "/app/accounts", "/app/deliveries", "/app/history", "/app/audits", "/app/border", "/app/profile"],
    "kam":      ["/app", "/app/accounts", "/app/payments", "/app/reversals", "/app/parts", "/app/agents", "/app/support"],
    "admin":    ["/app", "/app/jobs", "/app/ground", "/app/verify", "/app/payments", "/app/reversals",
                 "/app/team", "/app/notifications", "/app/support", "/app/ledger", "/app/kyc", "/app/profile"],
}
ACCOUNTS = [
    ("client@afrigen.link", "client"),
    ("supplier@afrigen.link", "supplier"),
    ("parts@afrigen.link", "parts"),
    ("field@afrigen.link", "field"),
    ("kam@afrigen.link", "kam"),
    ("admin@afrigen.link", "admin"),
]
IGNORE = ("favicon", "Download the React", "autocomplete", "manifest", "runable.js",
          "preload", "status of 404", "the server responded with a status of 4")


def run():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
        for email, label in ACCOUNTS:
            ctx = browser.new_context()
            page = ctx.new_page()
            errs = []
            page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errs.append("PAGEERR:" + str(e)))
            twofa = "none"
            section_report = []
            try:
                page.goto(f"{BASE}/app", wait_until="networkidle", timeout=30000)
                page.fill("input[placeholder*='you@company']", email)
                page.fill("input[type=password]", PW)
                page.click("button[type=submit]")
                page.wait_for_timeout(3500)
                body = page.inner_text("body")
                if "TWO-STEP" in body.upper() or "Confirm it's you" in body:
                    twofa = "challenge-shown"
                    code = totp(SECRETS[email])
                    page.fill("input[placeholder='000000']", code)
                    page.click("button:has-text('Verify')")
                    page.wait_for_timeout(4000)
                    b2 = page.inner_text("body")
                    if "TWO-STEP" not in b2.upper() and "Confirm it's you" not in b2:
                        twofa = "verified"
                elif "Secure your account" in body:
                    twofa = "enroll-required"
                # walk sections
                for route in SECTIONS[label]:
                    before = len(errs)
                    page.goto(f"{BASE}{route}", wait_until="networkidle", timeout=30000)
                    page.wait_for_timeout(1800)
                    txt = page.inner_text("body")
                    words = len(txt.split())
                    # detect if we bounced to marketing/login (auth failure)
                    is_dash = ("Sign in" not in txt) and ("TWO-STEP" not in txt.upper())
                    new_errs = [e for e in errs[before:] if not any(x in e for x in IGNORE)]
                    section_report.append((route, words, is_dash, new_errs))
            except Exception as e:
                section_report.append(("EXC", 0, False, [str(e)]))
            results.append((label, twofa, section_report))
            ctx.close()
            time.sleep(22)
        browser.close()

    print("\n===== DEEP DASHBOARD SWEEP =====")
    allok = True
    for label, twofa, sr in results:
        tf_ok = twofa == "verified"
        if not tf_ok:
            allok = False
        print(f"\n### {label.upper()}  (2FA-login={twofa} {'✓' if tf_ok else '✗'})")
        for route, words, is_dash, es in sr:
            ok = words > 40 and is_dash and len(es) == 0
            if not ok:
                allok = False
            print(f"  [{'OK' if ok else 'CHECK'}] {route:22} words={words:5} dash={is_dash} errs={len(es)}")
            for e in es[:3]:
                print(f"        - {e[:150]}")
    print("\n" + ("ALL GREEN \u2713" if allok else "SOME NEED REVIEW \u2717"))


run()
