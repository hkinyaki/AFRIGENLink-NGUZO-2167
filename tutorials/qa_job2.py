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
    # collect all job ids by clicking each card's navigate target - instead grab from network: visit each row
    # Click through cards: each has onClick navigate. Get count.
    cards=pg.locator("div").filter(has_text="units")
    # Use admin tenders API rendered list: find elements with stage labels
    body=pg.inner_text("body")
    # iterate: click each clickable job card and check for Parties
    found=False
    handles=pg.query_selector_all("[class*='cursor-pointer']")
    print("clickable cards:",len(handles))
    for i in range(len(handles)):
        cards=pg.query_selector_all("[class*='cursor-pointer']")
        if i>=len(cards): break
        cards[i].click(); pg.wait_for_timeout(1500)
        if pg.url.startswith(f"{BASE}/app/job/"):
            has="Parties" in pg.inner_text("body")
            stage=""
            print(f"  job {pg.url.split('/')[-1]} parties={has}")
            if has:
                found=True
                # dump parties text
                import re
                t=pg.inner_text("body")
                idx=t.find("Parties")
                print("    >>>", t[idx:idx+260].replace("\n"," | "))
                break
        pg.goto(f"{BASE}/app/jobs",wait_until="networkidle"); pg.wait_for_timeout(1000)
    print("PARTIES FOUND:",found)
    b.close()
print("ERRORS:",len(errs)); [print(" ✗",e) for e in errs[:10]]
