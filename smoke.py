import sys, asyncio
from playwright.async_api import async_playwright

ROLES = {
    "admin": ["/app", "/app/jobs", "/app/ground", "/app/verify", "/app/payments", "/app/reversals", "/app/team", "/app/notifications", "/app/ledger"],
    "kam": ["/app", "/app/jobs", "/app/payments", "/app/reversals", "/app/parts", "/app/agents"],
    "field": ["/app", "/app/inspect"],
    "supplier": ["/app", "/app/fleet", "/app/ledger"],
    "parts": ["/app"],
    "client": ["/app", "/app/ledger"],
}

async def login(page, email):
    await page.goto("http://localhost:4200/app", wait_until="networkidle")
    await page.fill("input[placeholder*='username']", f"{email}@afrigen.link")
    await page.fill("input[type=password]", "afrigen2026")
    await page.click("button[type=submit]")
    await page.wait_for_timeout(2800)

async def main():
    role = sys.argv[1]
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome-stable")
        ctx = await b.new_context(viewport={"width":1440,"height":900})
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(f"{role} console.{m.type}: {m.text}") if m.type=="error" else None)
        page.on("pageerror", lambda e: errors.append(f"{role} pageerror: {e}"))
        await login(page, role)
        for path in ROLES.get(role, ["/app"]):
            await page.goto(f"http://localhost:4200{path}", wait_until="networkidle")
            await page.wait_for_timeout(1200)
        await b.close()
    if errors:
        print("\n".join(errors))
    else:
        print(f"{role}: 0 console errors across {len(ROLES.get(role,[]))} routes")

asyncio.run(main())
