import sys, time, re, pyotp
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
CHROME = "/usr/bin/google-chrome-stable"
PW = "afrigen2026"

ACCOUNTS = [
    ("field@afrigen.link", "field"),
    ("kam@afrigen.link", "kam"),
    ("parts@afrigen.link", "parts"),
    ("admin@afrigen.link", "admin"),
]

def enroll_and_reach(page, label):
    """After login lands on EnrollTwoFactor. Confirm password, read secret, verify TOTP."""
    body = page.inner_text("body")
    if "Secure your account" not in body:
        return "no-enroll-screen", ""
    # phase password: confirm password
    page.fill("input[type=password]", PW)
    page.click("button:has-text('Start setup')")
    page.wait_for_timeout(2500)
    body2 = page.inner_text("body")
    toks = re.findall(r"\b[A-Z2-7]{16,}\b", body2)
    secret = toks[0] if toks else ""
    if not secret:
        return "no-secret", ""
    cb = page.locator("input[type=checkbox]")
    if cb.count() > 0:
        cb.first.check()
    code = pyotp.TOTP(secret).now()
    page.fill("input[placeholder='000000']", code)
    page.click("button:has-text('Confirm')")
    page.wait_for_timeout(4000)
    return "enrolled", secret

def run():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
        for email, label in ACCOUNTS:
            ctx = browser.new_context()
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            twofa_signal = False
            outcome = ""
            dash = ""
            try:
                page.goto(f"{BASE}/app", wait_until="networkidle", timeout=30000)
                page.fill("input[placeholder*='you@company']", email)
                page.fill("input[type=password]", PW)
                page.click("button[type=submit]")
                page.wait_for_timeout(2500)
                body = page.inner_text("body")
                # fresh account (2FA disabled) -> login succeeds -> EnrollTwoFactor
                if "Secure your account" in body:
                    twofa_signal = True  # gating forced enrollment
                    outcome, _ = enroll_and_reach(page, label)
                elif "TWO-STEP VERIFICATION" in body or "Confirm it's you" in body:
                    twofa_signal = True
                    outcome = "2fa-required-at-login"
                else:
                    outcome = "direct?"
                page.wait_for_timeout(2000)
                # capture dashboard identity
                dbody = page.inner_text("body")
                dash = dbody[:70].replace("\n", " ")
            except Exception as e:
                errors.append(f"EXC: {e}")
            real_errs = [e for e in errors if "favicon" not in e and "Download the React" not in e and "autocomplete" not in e]
            results.append((label, twofa_signal, outcome, len(real_errs), real_errs[:3], dash))
            ctx.close()
            time.sleep(20)
        browser.close()
    print("\n=== DASHBOARD SWEEP (fresh enroll) ===")
    allok = True
    for label, tf, outcome, ne, errs, dash in results:
        status = "OK" if (ne == 0 and tf and outcome == "enrolled") else "CHECK"
        if status != "OK": allok = False
        print(f"[{status}] {label:10} 2FA-gate={tf} outcome={outcome:10} errs={ne} :: {dash}")
        for e in errs:
            print(f"        - {e[:160]}")
    print("\nALL GREEN" if allok else "\nSOME NEED REVIEW")

run()
