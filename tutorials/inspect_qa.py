#!/usr/bin/env python3
"""Pre-publish QA: login each role, screenshot dashboards, collect console errors, brand-leak scan."""
import time, os
from playwright.sync_api import sync_playwright

CHROME = "/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
if not os.path.exists(CHROME):
    CHROME = "/usr/bin/google-chrome-stable"
BASE = "http://localhost:4200"
OUT = "/tmp/qa"
os.makedirs(OUT, exist_ok=True)

ROLES = {
    "client": "client@nguzo.africa",
    "supplier": "supplier@nguzo.africa",
    "field": "field@nguzo.africa",
    "admin": "admin@nguzo.africa",
}
PW = "nguzo2026"

errors = {}
leaks = {}

def login(page, email):
    page.goto(f"{BASE}/app", wait_until="networkidle")
    # ensure we're on login (not signup)
    try:
        page.get_by_placeholder("you@company.co.tz").fill(email, timeout=4000)
    except Exception:
        # try any email input
        page.locator('input[type="email"]').first.fill(email)
    page.locator('input[type="password"]').first.fill(PW)
    page.locator('button[type="submit"]').first.click()
    page.wait_for_load_state("networkidle")
    time.sleep(3)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    for role, email in ROLES.items():
        ctx = browser.new_context(viewport={"width":1440,"height":900})
        page = ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        page.on("pageerror", lambda e: errs.append(f"PAGEERROR: {e}"))
        try:
            login(page, email)
            page.screenshot(path=f"{OUT}/dash_{role}.png", full_page=True)
            body = page.inner_text("body")
            if "AFRIGEN" in body.upper():
                # find the offending snippet
                import re
                idx = body.upper().find("AFRIGEN")
                leaks[role] = body[max(0,idx-40):idx+40]
        except Exception as e:
            errs.append(f"FLOW-EXCEPTION: {e}")
        errors[role] = [e for e in errs if "favicon" not in e.lower()]
        ctx.close()
    browser.close()

print("=== CONSOLE/ERRORS PER ROLE ===")
for r, e in errors.items():
    print(f"[{r}] {len(e)} error(s)")
    for x in e[:8]:
        print(f"    - {x[:160]}")
print("=== BRAND LEAKS (user-facing AFRIGEN) ===")
print(leaks if leaks else "NONE")
