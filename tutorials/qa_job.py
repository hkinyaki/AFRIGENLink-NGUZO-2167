from playwright.sync_api import sync_playwright
BASE="http://localhost:4200"; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome-stable",headless=True)
    pg=b.new_context(viewport={"width":1440,"height":900}).new_page()
    pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(f"{BASE}/app",wait_until="networkidle")
    pg.fill("input[placeholder*='username']","admin@nguzo.africa"); pg.fill("input[type=password]","nguzo2026"); pg.click("button[type=submit]"); pg.wait_for_timeout(2500)
    pg.goto(f"{BASE}/app/jobs",wait_until="networkidle"); pg.wait_for_timeout(1500)
    # find a job link
    links=pg.eval_on_selector_all("a[href*='/app/job/'], [onclick]", "els=>els.map(e=>e.getAttribute('href')).filter(Boolean)")
    print("job links:", links[:5])
    # try clicking first job card text
    try:
        pg.locator("text=units").first.click(timeout=4000)
    except Exception:
        # navigate to job detail via overview contracts? just click any row
        rows=pg.locator("tr td").first
        pg.locator("h1, .cursor-pointer").first.click(timeout=3000)
    pg.wait_for_timeout(2000)
    url=pg.url
    has_parties="Parties" in pg.inner_text("body")
    print("url after click:", url, "· Parties card present:", has_parties)
    b.close()
print("ERRORS:",len(errs)); [print(" ✗",e) for e in errs[:10]]
