import re, time, pyotp
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
CHROME = "/usr/bin/google-chrome-stable"
PW = "afrigen2026"
PIN = "123456"

def login_enroll(page):
    page.goto(f"{BASE}/app", wait_until="networkidle", timeout=30000)
    page.fill("input[placeholder*='you@company']", "admin@afrigen.link")
    page.fill("input[type=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_timeout(3000)
    body = page.inner_text("body")
    if "Secure your account" in body:
        page.fill("input[type=password]", PW)
        page.click("button:has-text('Start setup')")
        page.wait_for_timeout(2500)
        body2 = page.inner_text("body")
        toks = re.findall(r"\b[A-Z2-7]{16,}\b", body2)
        secret = toks[0]
        cb = page.locator("input[type=checkbox]")
        if cb.count() > 0: cb.first.check()
        page.fill("input[placeholder='000000']", pyotp.TOTP(secret).now())
        page.click("button:has-text('Confirm')")
        page.wait_for_timeout(4000)
        return secret
    elif "TWO-STEP" in body.upper() or "Confirm it" in body:
        raise SystemExit("Account already enrolled — reset 2FA first to read secret.")
    return None

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
    ctx = b.new_context()
    page = ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(str(e)))

    secret = login_enroll(page)
    print("enrolled secret:", bool(secret))
    print("URL after login:", page.url)

    # go to Payments
    page.goto(f"{BASE}/app/payments", wait_until="networkidle")
    page.wait_for_timeout(2000)
    body = page.inner_text("body")
    print("PIN card present on profile? checking master pin form...")

    # verify master PIN form exists on profile page
    page.goto(f"{BASE}/app/profile", wait_until="networkidle")
    page.wait_for_timeout(1500)
    pbody = page.inner_text("body")
    print("Master PIN section on profile:", "master PIN" in pbody or "Master PIN" in pbody or "Payout master PIN" in pbody)

    # back to payments, find the release button
    page.goto(f"{BASE}/app/payments", wait_until="networkidle")
    page.wait_for_timeout(2500)
    rel = page.locator("button:has-text('Instruct transfer')")
    print("release buttons found:", rel.count())
    if rel.count() == 0:
        print("BODY SNIP:", page.inner_text("body")[:300])
        b.close(); raise SystemExit("no payout card")
    rel.first.click()
    page.wait_for_timeout(1500)
    mbody = page.inner_text("body")
    print("modal open:", "Payout gateway" in mbody)

    # upload proof
    import tempfile, os
    img = os.path.join(tempfile.gettempdir(), "tt.png")
    # 1x1 png
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082")
    open(img, "wb").write(png)
    page.set_input_files("input[type=file]", img)
    page.wait_for_timeout(2500)

    # TOTP + PIN
    page.fill("input[placeholder='000000']", pyotp.TOTP(secret).now())
    pin_input = page.locator("input[placeholder='••••••']")
    pin_input.fill(PIN)
    page.wait_for_timeout(500)
    page.click("button:has-text('Release payment')")
    page.wait_for_timeout(4000)
    fbody = page.inner_text("body")
    released = "Payment released" in fbody
    print("RELEASED:", released)
    if not released:
        print("MODAL SNIP:", fbody[:400])

    real = [e for e in errs if "favicon" not in e and "Download the React" not in e and "autocomplete" not in e]
    print("console errors:", len(real))
    for e in real[:5]: print("  -", e[:160])
    print("RESULT:", "PASS" if released and len(real) == 0 else "FAIL")
    b.close()
