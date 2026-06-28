"""Record the REAL Nguzo flow in motion via Playwright video capture.
Drives the actual UI (clicks, forms, uploads) with a VISIBLE animated cursor +
click ripple. One context per role -> one .webm per role. Saved raw to
tutorials/raw/. Assembly (VO/captions/concat) handled by build_walkthrough.py.

Each high-level ACTION is wrapped so build_walkthrough can map narration to it
via the printed STEP markers (timestamps per role aren't needed: we cut by the
recorded segment boundaries instead -> see notes).
Run: python3 record_flow.py
"""
import os, time, json, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
PASS = "nguzo2026"
CHROME = "/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
ROOT = "/home/user/afrigen/tutorials"
RAW = f"{ROOT}/raw"
DOCS = f"{ROOT}/docs"
VP = {"width": 1600, "height": 900}
for d in (RAW,): os.makedirs(d, exist_ok=True)

ACCOUNTS = {
    "client":   "client@nguzo.africa",
    "supplier": "supplier@nguzo.africa",
    "supplier2":"supplier2@nguzo.africa",
    "field":    "field@nguzo.africa",
    "admin":    "admin@nguzo.africa",
}

# ---- visible cursor + ripple injected into every page ----
CURSOR_JS = r"""
() => {
  if (window.__nz_cursor) return;
  const c = document.createElement('div');
  c.id='__nzc';
  c.style.cssText='position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;'
    +'pointer-events:none;transition:transform .55s cubic-bezier(.22,1,.36,1);'
    +'transform:translate(-100px,-100px);will-change:transform;';
  c.innerHTML='<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 20 L8 15 L11 22 L14 21 L11 14 L18 14 Z" '
    +'fill="#fff" stroke="#141B2E" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  window.__nz_cursor = c;
  window.__nzMove = (x,y)=>{ c.style.transform='translate('+(x-3)+'px,'+(y-2)+'px)'; };
  window.__nzRipple = (x,y)=>{
    const r=document.createElement('div');
    r.style.cssText='position:fixed;left:'+(x-6)+'px;top:'+(y-6)+'px;width:12px;height:12px;'
      +'border:2px solid #D99A2B;border-radius:50%;z-index:2147483646;pointer-events:none;'
      +'opacity:.9;transition:all .5s ease-out;';
    document.body.appendChild(r);
    requestAnimationFrame(()=>{ r.style.width='52px';r.style.height='52px';r.style.left=(x-26)+'px';
      r.style.top=(y-26)+'px';r.style.opacity='0'; });
    setTimeout(()=>r.remove(),520);
  };
}
"""

def role_dir(role):
    d = f"{RAW}/{role}"; os.makedirs(d, exist_ok=True); return d

def beat(page, ms=900): page.wait_for_timeout(ms)

def ensure_cursor(page):
    try: page.evaluate(CURSOR_JS)
    except Exception: pass

def center(page, selector, nth=0):
    loc = page.locator(selector).nth(nth)
    loc.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    box = loc.bounding_box()
    if not box: raise RuntimeError(f"no box for {selector}")
    return loc, box["x"]+box["width"]/2, box["y"]+box["height"]/2

def move_to(page, x, y, settle=700):
    ensure_cursor(page)
    page.evaluate("([x,y])=>window.__nzMove(x,y)", [x,y])
    page.wait_for_timeout(settle)

def click_sel(page, selector, nth=0, settle=700, after=900):
    loc, x, y = center(page, selector, nth)
    move_to(page, x, y, settle)
    page.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
    page.wait_for_timeout(160)
    loc.click()
    page.wait_for_timeout(after)

def click_text(page, text, settle=700, after=900, exact=False):
    loc = page.get_by_text(text, exact=exact).first
    loc.scroll_into_view_if_needed(); page.wait_for_timeout(250)
    box = loc.bounding_box()
    if box:
        x,y = box["x"]+box["width"]/2, box["y"]+box["height"]/2
        move_to(page, x, y, settle)
        page.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
        page.wait_for_timeout(160)
    loc.click(); page.wait_for_timeout(after)

def click_button(page, name, settle=700, after=1000):
    loc = page.get_by_role("button", name=name).first
    loc.scroll_into_view_if_needed(); page.wait_for_timeout(250)
    box = loc.bounding_box()
    if box:
        x,y = box["x"]+box["width"]/2, box["y"]+box["height"]/2
        move_to(page, x, y, settle)
        page.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
        page.wait_for_timeout(160)
    loc.click(); page.wait_for_timeout(after)

def type_into(page, selector, text, nth=0, settle=600):
    loc, x, y = center(page, selector, nth)
    move_to(page, x, y, settle)
    page.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
    loc.click(); page.wait_for_timeout(150)
    loc.fill(""); loc.type(text, delay=38)
    page.wait_for_timeout(500)

def goto(page, path, wait=1600):
    page.goto(BASE+path, wait_until="networkidle")
    ensure_cursor(page); page.wait_for_timeout(wait)

def login(ctx, email, role):
    page = ctx.new_page()
    page.goto(BASE+"/app", wait_until="networkidle")
    ensure_cursor(page)
    page.wait_for_selector('input[type="email"]', timeout=15000)
    beat(page, 700)
    type_into(page, 'input[type="email"]', email)
    type_into(page, 'input[type="password"]', PASS)
    click_sel(page, 'button[type="submit"]', after=3500)
    ensure_cursor(page)
    return page


# ======================================================================
# PER-SEGMENT RECORDING
# Each segment opens a FRESH recording context (so the .webm playback time
# == wall-clock time, no Playwright VFR/idle drift). State persists in the DB
# across segments because every step writes to the backend. One short clean
# .webm per segment -> build_walkthrough concats them in order.
# ======================================================================
SEGDIR = f"{ROOT}/seg"
os.makedirs(SEGDIR, exist_ok=True)

AGREE  = f"{DOCS}/Signed-Transport-Agreement-Nguzo.pdf"
MACH   = f"{DOCS}/Vehicle-Registration-Inspection-Certificate.pdf"
PERMIT = f"{DOCS}/TARURA-Transit-Permit.pdf"
TT     = f"{DOCS}/TT-Payment-SWIFT-Confirmation.pdf"

def try_button(page, name, after=2500, timeout=4000):
    try:
        page.get_by_role("button", name=name).first.wait_for(state="visible", timeout=timeout)
        click_button(page, name, after=after); return True
    except Exception as e:
        print("   (skip)", name, type(e).__name__); return False

state = {"tid": None}

def seg(browser, sid, role):
    """context manager-ish: returns (ctx, page) recording to seg/<sid>/"""
    d = f"{SEGDIR}/{sid}"; os.makedirs(d, exist_ok=True)
    ctx = browser.new_context(viewport=VP, record_video_dir=d, record_video_size=VP)
    page = login(ctx, ACCOUNTS[role], role)
    return ctx, page

def finish(ctx, page, sid, store):
    path = page.video.path()
    ctx.close()
    store[sid] = path
    print(f"SEG {sid} -> {path}")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    segs = {}

    # ---- 1. CLIENT posts a job ----
    ctx, cc = seg(browser, "post", "client")
    goto(cc, "/app"); beat(cc, 600)
    click_button(cc, "Post a Job"); beat(cc, 900)
    click_text(cc, "Cargo transport"); beat(cc, 600)
    sel = cc.locator("select").first
    _,x,y = center(cc, "select", 0); move_to(cc, x, y); cc.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
    sel.select_option(label="Tipper Truck"); beat(cc, 700)
    type_into(cc, 'input[type="number"]', "5")
    type_into(cc, 'input[placeholder*="river sand"]', "600t river sand for foundation works")
    type_into(cc, 'input:not([type="number"]):not([placeholder])', "Dar es Salaam")
    type_into(cc, 'input[placeholder="e.g. Geita"]', "Geita")
    type_into(cc, 'input[placeholder*="Auto-generated"]', "River sand — Dar es Salaam to Geita")
    click_button(cc, "Post job & open for bids", after=3000)
    beat(cc, 1200)
    r = cc.context.request.fetch(BASE+"/api/tenders")
    state["tid"] = r.json().get("tenders", [])[0]["id"]
    print("TENDER", state["tid"])
    finish(ctx, cc, "post", segs)

    tid = state["tid"]

    # ---- 2. CLIENT shows the staged gate on the job page ----
    ctx, cc = seg(browser, "open", "client")
    goto(cc, f"/app/job/{tid}"); beat(cc, 2600)
    finish(ctx, cc, "open", segs)

    # ---- 3. SUPPLIER 1 bids ----
    ctx, sp = seg(browser, "bid1", "supplier")
    goto(sp, f"/app/job/{tid}"); beat(sp, 1100)
    type_into(sp, 'input[type="number"]', "2", nth=0)
    type_into(sp, 'input[type="number"]', "500000", nth=1)
    click_button(sp, "Submit bid", after=2600)
    beat(sp, 1200)
    finish(ctx, sp, "bid1", segs)

    # ---- 4. SUPPLIER 2 bids ----
    ctx, sp2 = seg(browser, "bid2", "supplier2")
    goto(sp2, f"/app/job/{tid}"); beat(sp2, 1000)
    type_into(sp2, 'input[type="number"]', "3", nth=0)
    type_into(sp2, 'input[type="number"]', "540000", nth=1)
    click_button(sp2, "Submit bid", after=2600)
    beat(sp2, 1200)
    finish(ctx, sp2, "bid2", segs)

    # ---- 5. CLIENT confirms award ----
    ctx, cc = seg(browser, "award", "client")
    goto(cc, f"/app/job/{tid}"); beat(cc, 1800)
    click_button(cc, "Confirm award", after=3500)
    beat(cc, 2400)
    finish(ctx, cc, "award", segs)

    # ---- 6. SUPPLIER 1 downloads + signs + uploads agreement (advances gate) ----
    ctx, sp = seg(browser, "agree", "supplier")
    goto(sp, f"/app/job/{tid}"); beat(sp, 1200)
    try_button(sp, "Download agreement (PDF)", after=1600)
    sp.set_input_files('input[type="file"]', AGREE); beat(sp, 2400)
    try_button(sp, "Confirm agreement signed", after=2800)
    beat(sp, 1000)
    finish(ctx, sp, "agree", segs)

    # supplier2 also uploads its signed agreement (no recording needed for narrative,
    # but the gate already advanced on supplier1's confirm; supplier2 just uploads to
    # keep its own contract consistent). Do it head-less of the segment list.
    ctx2, sp2 = seg(browser, "_sp2agree", "supplier2")
    goto(sp2, f"/app/job/{tid}"); beat(sp2, 800)
    if try_button(sp2, "Download agreement (PDF)", after=800, timeout=3000):
        sp2.set_input_files('input[type="file"]', AGREE); beat(sp2, 1500)
        try_button(sp2, "Confirm agreement signed", after=1500)
    sp2.context.close()  # discard (not in segs)

    # ---- 7. SUPPLIERS upload machine docs (supplier1 advances gate) ----
    ctx, sp = seg(browser, "docs", "supplier")
    goto(sp, f"/app/job/{tid}"); beat(sp, 1100)
    try:
        sp.locator('input[type="file"]').first.wait_for(state="attached", timeout=5000)
        sp.set_input_files('input[type="file"]', MACH); beat(sp, 2400)
    except Exception as e:
        print("   (docs skip)", type(e).__name__)
    try_button(sp, "Submit documents for inspection", after=2600)
    beat(sp, 1000)
    finish(ctx, sp, "docs", segs)

    # supplier2 machine docs (gate already advanced) - discard recording
    ctx2, sp2 = seg(browser, "_sp2docs", "supplier2")
    goto(sp2, f"/app/job/{tid}"); beat(sp2, 700)
    try:
        sp2.locator('input[type="file"]').first.wait_for(state="attached", timeout=3000)
        sp2.set_input_files('input[type="file"]', MACH); beat(sp2, 1200)
        try_button(sp2, "Submit documents for inspection", after=1200, timeout=3000)
    except Exception as e:
        print("   (sp2 docs skip)", type(e).__name__)
    sp2.context.close()

    # ---- 8. FIELD inspects + verifies ----
    ctx, fd = seg(browser, "inspect", "field")
    goto(fd, "/app"); beat(fd, 1400)
    goto(fd, f"/app/inspect/{tid}"); beat(fd, 1600)
    type_into(fd, 'input[placeholder*="VIN"]', "FAW-J6-2023-CH-77418")
    nb = fd.locator("textarea").first
    _,x,y = center(fd, "textarea", 0); move_to(fd,x,y); fd.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
    nb.click(); nb.type("Undercarriage, hydraulics and load rating verified on site. Documents match assets.", delay=16)
    beat(fd, 700)
    click_sel(fd, 'input[type="checkbox"]', after=900)
    click_button(fd, "Verify & advance", after=3000)
    beat(fd, 1200)
    finish(ctx, fd, "inspect", segs)

    # ---- 9. CLIENT uploads permits ----
    ctx, cc = seg(browser, "permits", "client")
    goto(cc, f"/app/job/{tid}"); beat(cc, 1400)
    cc.set_input_files('input[type="file"]', PERMIT); beat(cc, 2400)
    click_button(cc, "Submit permits for verification", after=2800)
    beat(cc, 1100)
    finish(ctx, cc, "permits", segs)

    # ---- 10. ADMIN verifies permits ----
    ctx, ad = seg(browser, "pverify", "admin")
    goto(ad, f"/app/job/{tid}"); beat(ad, 1600)
    click_button(ad, "Verify permits", after=3000)
    beat(ad, 1400)
    finish(ctx, ad, "pverify", segs)

    # ---- 11. CLIENT uploads TT proof (escrow funding) ----
    ctx, cc = seg(browser, "tt", "client")
    goto(cc, f"/app/job/{tid}"); beat(cc, 1700)
    cc.set_input_files('input[type="file"]', TT); beat(cc, 2400)
    click_button(cc, "Submit payment proof", after=2800)
    beat(cc, 1600)
    finish(ctx, cc, "tt", segs)

    # ---- 12. ADMIN confirms payment received ----
    ctx, ad = seg(browser, "ttok", "admin")
    goto(ad, f"/app/job/{tid}"); beat(ad, 1700)
    click_button(ad, "Confirm payment received", after=3000)
    beat(ad, 1800)
    finish(ctx, ad, "ttok", segs)

    # ---- 13. ADMIN approves to execute ----
    ctx, ad = seg(browser, "exec", "admin")
    goto(ad, f"/app/job/{tid}"); beat(ad, 1600)
    click_button(ad, "Approve to execute", after=3200)
    beat(ad, 2000)
    finish(ctx, ad, "exec", segs)

    # ---- 14. ADMIN final timeline / settlement view ----
    ctx, ad = seg(browser, "timeline", "admin")
    goto(ad, f"/app/job/{tid}"); beat(ad, 3200)
    # scroll down slowly to reveal timeline + settlement
    for _ in range(3):
        ad.mouse.wheel(0, 360); beat(ad, 1100)
    beat(ad, 1500)
    finish(ctx, ad, "timeline", segs)

    browser.close()

results = {"tender": tid, "segs": segs}
with open(f"{SEGDIR}/_segs.json", "w") as f:
    json.dump(results, f, indent=2)
print("DONE", json.dumps(results))
