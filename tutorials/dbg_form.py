import time
from playwright.sync_api import sync_playwright
BASE="http://localhost:4200"; PASS="nguzo2026"
CHROME="/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1600,"height":900})
    pg.goto(BASE+"/app",wait_until="networkidle")
    pg.fill('input[type="email"]',"client@nguzo.africa")
    pg.fill('input[type="password"]',PASS)
    pg.click('button[type="submit"]'); pg.wait_for_timeout(3000)
    pg.goto(BASE+"/app",wait_until="networkidle")
    pg.get_by_role("button",name="Post a Job").first.click(); pg.wait_for_timeout(1200)

    # Click the Cargo transport card via the label text -> climb to button
    card = pg.get_by_role("button", name="Cargo transport").first
    print("cargo button count:", pg.get_by_role("button", name="Cargo transport").count())
    card.click(); pg.wait_for_timeout(600)

    sel = pg.locator("select").first
    print("options:", sel.locator("option").all_inner_texts())
    sel.select_option(label="Tipper Truck"); pg.wait_for_timeout(400)
    print("select value after select_option:", sel.input_value())

    # fill destination
    dest = pg.locator('input[placeholder*="Geita"]').first
    dest.click(); dest.fill("Geita"); pg.wait_for_timeout(300)
    print("dest value:", dest.input_value())

    btn = pg.get_by_role("button", name="Post job & open for bids").first
    print("post btn disabled:", btn.is_disabled())

    # Try react-style: dispatch change explicitly via native setter on select
    pg.evaluate("""() => {
      const s=document.querySelector('select');
      const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
      setter.call(s,'Tipper Truck');
      s.dispatchEvent(new Event('change',{bubbles:true}));
    }""")
    pg.wait_for_timeout(400)
    print("after native dispatch -> btn disabled:", btn.is_disabled(), "sel:", sel.input_value())
    b.close()
