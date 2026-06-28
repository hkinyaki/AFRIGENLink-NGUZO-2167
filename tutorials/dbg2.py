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
    pg.get_by_role("button", name="Cargo transport").first.click(); pg.wait_for_timeout(500)

    print("select count:", pg.locator("select").count())
    print("number inputs:", pg.locator('input[type="number"]').count())

    # Use Playwright high-level select with explicit user gesture
    sel = pg.locator("select").first
    sel.scroll_into_view_if_needed()
    sel.select_option("Tipper Truck")  # by value (value==label here)
    pg.wait_for_timeout(500)
    print("sel val:", sel.input_value())

    # dump all buttons + disabled
    btns = pg.get_by_role("button").all()
    for i,bt in enumerate(btns):
        try:
            t=bt.inner_text().strip().replace("\n"," ")[:40]
            if "Post job" in t or "Posting" in t:
                print("BTN", i, repr(t), "disabled=",bt.is_disabled())
        except: pass

    # check the actual destination input value via the disabled button condition
    dest = pg.locator('input[placeholder*="Geita"]').first
    dest.fill("Geita"); pg.wait_for_timeout(300)
    btn = pg.get_by_role("button", name="Post job & open for bids").first
    print("final disabled:", btn.is_disabled())
    # screenshot for eyeballing
    pg.screenshot(path="/home/user/afrigen/tutorials/dbg2.png")
    b.close()
