from playwright.sync_api import sync_playwright
import json
BASE="http://localhost:4200"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome-stable",headless=True)
    pg=b.new_context(viewport={"width":1440,"height":900}).new_page()
    captured={}
    def on_resp(r):
        if "/api/tenders/" in r.url and r.request.method=="GET":
            try: captured[r.url]=r.json()
            except: pass
    pg.on("response",on_resp)
    pg.goto(f"{BASE}/app",wait_until="networkidle")
    pg.fill("input[placeholder*='username']","admin@nguzo.africa"); pg.fill("input[type=password]","nguzo2026"); pg.click("button[type=submit]"); pg.wait_for_timeout(2500)
    pg.goto(f"{BASE}/app/job/tnd_ls5looseqid",wait_until="networkidle"); pg.wait_for_timeout(2500)
    for url,data in captured.items():
        print("URL:",url)
        print("  has 'parties' key:", "parties" in data)
        if "parties" in data:
            par=data["parties"]
            print("  client:",par.get("client"))
            print("  suppliers:",len(par.get("suppliers",[])),"fieldAgents:",len(par.get("fieldAgents",[])))
        print("  contracts:",len(data.get("contracts",[])))
    b.close()
