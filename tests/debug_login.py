import time, pyotp
from playwright.sync_api import sync_playwright
BASE="http://localhost:4200"; CHROME="/usr/bin/google-chrome-stable"; PW="afrigen2026"
SEC="MShSkQsasCrTDfXZpnazrAmEN5Gvp-OS"  # admin
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
    pg=b.new_page()
    logs=[]
    pg.on("console", lambda m: logs.append(f"{m.type}:{m.text}"))
    pg.on("response", lambda r: logs.append(f"RESP {r.status} {r.url}") if "/api/" in r.url else None)
    pg.goto(f"{BASE}/app", wait_until="networkidle", timeout=30000)
    print("URL after goto:", pg.url)
    print("inputs:", pg.locator("input").count())
    pg.fill("input[placeholder*='you@company']", "admin@afrigen.link")
    pg.fill("input[type=password]", PW)
    pg.click("button[type=submit]")
    pg.wait_for_timeout(4000)
    print("URL after submit:", pg.url)
    body=pg.inner_text("body")
    print("BODY HEAD:", body[:300].replace("\n"," "))
    print("--- API/console logs ---")
    for l in logs[-25:]:
        print(" ", l[:160])
    b.close()
