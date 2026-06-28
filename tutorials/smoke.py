"""Smoke test: login as client, open Post a Job, verify selectors + cursor inject."""
import sys
sys.path.insert(0,"/home/user/afrigen/tutorials")
from playwright.sync_api import sync_playwright
exec(open("/home/user/afrigen/tutorials/record_flow.py").read().split("results = {}")[0])  # import helpers

CHROME="/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    ctx = b.new_context(viewport=VP)
    page = login(ctx, "client@nguzo.africa", "client")
    goto(page, "/app")
    print("on app:", page.url)
    click_button(page, "Post a Job"); print("post-a-job clicked, url", page.url)
    # check key fields exist
    for sel in ['select','input[type="number"]','input[placeholder*="600t"]','input[placeholder*="Geita"]','input[placeholder*="Auto-generated"]']:
        print(sel, "->", page.locator(sel).count())
    print("demand card 'Cargo transport' count:", page.get_by_text("Cargo transport").count())
    print("post button:", page.get_by_role("button", name="Post job & open for bids").count())
    page.screenshot(path="/home/user/afrigen/tutorials/_smoke.png")
    ctx.close(); b.close()
print("SMOKE OK")
