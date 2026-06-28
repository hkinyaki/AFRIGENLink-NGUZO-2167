import os
from playwright.sync_api import sync_playwright

OUT = "/home/user/afrigen/shots"
os.makedirs(OUT, exist_ok=True)
BASE = "http://localhost:4200"
PASS = "afrigen2026"

roles = {
    "client":   {"email": "client@afrigen.africa",   "tabs": [("pipeline","/app"),("new","/app/new"),("cargo","/app/cargo")]},
    "supplier": {"email": "supplier@afrigen.africa", "tabs": [("fleet","/app"),("vault","/app/vault"),("breakdown","/app/breakdown"),("cargobids","/app/cargo")]},
    "field":    {"email": "field@afrigen.africa",    "tabs": [("audits","/app"),("border","/app/border")]},
    "admin":    {"email": "admin@afrigen.africa",    "tabs": [("overview","/app"),("verify","/app/verify"),("ledger","/app/ledger")]},
}

with sync_playwright() as p:
    browser = p.chromium.launch()

    # fresh context for auth screenshot (no session)
    ctx0 = browser.new_context(viewport={"width":1920,"height":1080})
    page0 = ctx0.new_page()
    page0.goto(BASE, wait_until="networkidle")
    page0.wait_for_timeout(1800)
    page0.screenshot(path=f"{OUT}/00-auth.png")
    print("shot 00-auth")
    ctx0.close()

    for role, cfg in roles.items():
        # brand new isolated context => no cookies, fresh auth form
        ctx = browser.new_context(viewport={"width":1920,"height":1080})
        page = ctx.new_page()
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_selector('input[type="email"]', timeout=15000)
        page.locator('input[type="email"]').fill(cfg["email"])
        page.locator('input[type="password"]').fill(PASS)
        page.get_by_role("button", name="Sign in").last.click()
        page.wait_for_timeout(3000)

        for name, href in cfg["tabs"]:
            page.goto(BASE + href, wait_until="networkidle")
            page.wait_for_timeout(1800)
            page.screenshot(path=f"{OUT}/{role}-{name}.png")
            print("shot", f"{role}-{name}")

        if role == "client":
            page.goto(BASE + "/app", wait_until="networkidle")
            page.wait_for_timeout(1500)
            try:
                link = page.get_by_text("Open").or_(page.get_by_text("View")).or_(page.get_by_text("Details")).first
                link.click(timeout=3000)
                page.wait_for_timeout(2000)
                page.screenshot(path=f"{OUT}/client-contract.png")
                print("shot client-contract")
            except Exception as e:
                print("contract link skip:", e)

        ctx.close()

    browser.close()
    print("DONE")
