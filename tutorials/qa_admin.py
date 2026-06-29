import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
errors = []

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome-stable", headless=True)
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        # login
        pg.goto(f"{BASE}/app", wait_until="networkidle")
        pg.fill("input[placeholder*=\"username\"]", "admin@nguzo.africa")
        pg.fill("input[type=password]", "nguzo2026")
        pg.click("button[type=submit]")
        pg.wait_for_timeout(3000)
        routes = {
            "overview": "/app",
            "jobs": "/app/jobs",
            "ground": "/app/ground",
            "verify": "/app/verify",
            "team": "/app/team",
            "notifications": "/app/notifications",
            "ledger": "/app/ledger",
        }
        for name, r in routes.items():
            pg.goto(f"{BASE}{r}", wait_until="networkidle")
            pg.wait_for_timeout(1500)
            txt = pg.inner_text("body")[:80].replace("\n", " ")
            print(f"  {name:14s} {r:22s} ok · {txt}")
        # team tabs
        pg.goto(f"{BASE}/app/team", wait_until="networkidle"); pg.wait_for_timeout(1200)
        for tab in ["Clients", "Suppliers", "Teams"]:
            try:
                pg.click(f"button:has-text('{tab}')")
                pg.wait_for_timeout(800)
                print(f"  team tab '{tab}' clicked ok")
            except Exception as e:
                print(f"  team tab '{tab}' FAIL {e}")
        # verify staff tab
        pg.goto(f"{BASE}/app/verify", wait_until="networkidle"); pg.wait_for_timeout(1000)
        try:
            pg.click("button:has-text('Staff on queue')"); pg.wait_for_timeout(700)
            print("  verify 'Staff on queue' tab ok")
        except Exception as e:
            print(f"  verify staff tab FAIL {e}")
        # open a job to check Parties card
        pg.goto(f"{BASE}/app/jobs", wait_until="networkidle"); pg.wait_for_timeout(1200)
        try:
            pg.locator("[class*=cursor-pointer], a[href*='/app/job/'], div:has-text('unit')").first
            # click first job card
            cards = pg.locator("text=unit").first
            pg.goto(f"{BASE}/app/jobs"); pg.wait_for_timeout(800)
        except Exception:
            pass
        b.close()

run()
print("\nCONSOLE ERRORS:", len(errors))
for e in errors[:20]:
    print("  ✗", e)
sys.exit(1 if errors else 0)
