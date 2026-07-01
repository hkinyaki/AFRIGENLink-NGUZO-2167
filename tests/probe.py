import pyotp, re
from playwright.sync_api import sync_playwright
BASE="http://localhost:4200"; CHROME="/usr/bin/google-chrome-stable"; PW="afrigen2026"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,headless=True,args=["--no-sandbox"])
    ctx=b.new_context(); page=ctx.new_page()
    page.on("console", lambda m: print("CONSOLE",m.type,m.text[:200]))
    page.on("pageerror", lambda e: print("PAGEERR",str(e)[:200]))
    resp=[]
    page.on("response", lambda r: resp.append((r.status,r.url)) if "/api/" in r.url or "sign-in" in r.url or "two-factor" in r.url else None)
    page.goto(f"{BASE}/app",wait_until="networkidle")
    page.fill("input[placeholder*='you@company']","admin@afrigen.link")
    page.fill("input[type=password]",PW)
    page.click("button[type=submit]")
    page.wait_for_timeout(4000)
    print("URL:",page.url)
    print("--- network ---")
    for s,u in resp: print(s,u)
    b.close()
