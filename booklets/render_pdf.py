#!/usr/bin/env python3
import sys, glob, os, time
from playwright.sync_api import sync_playwright

CHROME = "/usr/bin/google-chrome-stable"
BASE = "http://localhost:8899/build"

files = sorted(glob.glob("build/*.html"))
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    page = browser.new_page()
    for f in files:
        name = os.path.basename(f).replace(".html", "")
        url = f"{BASE}/{os.path.basename(f)}"
        page.goto(url, wait_until="networkidle", timeout=60000)
        # ensure fonts loaded
        page.evaluate("document.fonts.ready")
        time.sleep(1.5)
        out = f"build/{name}.pdf"
        page.pdf(path=out, width="210mm", height="297mm", print_background=True,
                 margin={"top":"0","bottom":"0","left":"0","right":"0"})
        sz = os.path.getsize(out)//1024
        print(f"{out}  ({sz} KB)")
    browser.close()
