import asyncio, pyotp
from playwright.async_api import async_playwright

SECRET = "JBSWY3DPEHPK3PXP"
BASE = "http://localhost:4200"

ROLES = {
    "admin": ["/app", "/app/jobs", "/app/ground", "/app/verify", "/app/payments", "/app/reversals", "/app/team", "/app/notifications", "/app/ledger"],
    "kam": ["/app", "/app/jobs", "/app/payments", "/app/reversals", "/app/parts", "/app/agents"],
    "field": ["/app", "/app/inspect"],
    "supplier": ["/app", "/app/fleet", "/app/ledger"],
    "parts": ["/app"],
    "client": ["/app", "/app/ledger"],
}

async def login(page, email, errors):
    await page.goto(f"{BASE}/app", wait_until="networkidle")
    await page.fill("input[placeholder*='username']", f"{email}@afrigen.link")
    await page.fill("input[type=password]", "afrigen2026")
    await page.click("button[type=submit]")
    # wait for 2FA step
    try:
        await page.wait_for_selector("input[placeholder='000000']", timeout=6000)
    except Exception:
        errors.append(f"{email}: 2FA code input never appeared (2FA not enforced!)")
        return False
    code = pyotp.TOTP(SECRET).now()
    await page.fill("input[placeholder='000000']", code)
    await page.click("button[type=submit]")
    await page.wait_for_timeout(3000)
    # confirm we reached a dashboard (not stuck on 2FA/onboarding)
    if await page.query_selector("input[placeholder='000000']"):
        errors.append(f"{email}: still on 2FA screen after code (verify failed)")
        return False
    return True

async def sweep(role):
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome-stable")
        ctx = await b.new_context(viewport={"width":1440,"height":900})
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(f"{role} console.error: {m.text}") if m.type=="error" else None)
        page.on("pageerror", lambda e: errors.append(f"{role} pageerror: {e}"))
        ok = await login(page, role, errors)
        if ok:
            for path in ROLES[role]:
                await page.goto(f"{BASE}{path}", wait_until="networkidle")
                await page.wait_for_timeout(900)
        await b.close()
    return errors

async def main():
    all_errs = []
    for role in ROLES:
        errs = await sweep(role)
        if errs:
            all_errs += errs
            print(f"[{role}] {len(errs)} issue(s)")
            for e in errs: print("   ", e[:200])
        else:
            print(f"[{role}] OK — 2FA enforced, login+TOTP passed, 0 console errors across {len(ROLES[role])} routes")
    print("\n=== SUMMARY:", "ALL CLEAN" if not all_errs else f"{len(all_errs)} issues", "===")

asyncio.run(main())
