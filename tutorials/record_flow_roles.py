"""Per-ROLE training recorder for Nguzo. Forked from record_flow.py.

Records detailed, slower-paced, section-by-section walkthroughs for ONE role at a
time so a new hire can learn their whole dashboard just by watching. Visible
animated cursor + click ripple. Per-segment fresh recording context (avoids
Playwright VFR/idle drift). Output: tutorials/seg_roles/<role>/<segment>/*.webm
+ tutorials/seg_roles/<role>/_segs.json.

Usage:
  python3 record_flow_roles.py field
  python3 record_flow_roles.py client
  python3 record_flow_roles.py supplier
  python3 record_flow_roles.py admin
"""
import os, time, json, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
PASS = "nguzo2026"
CHROME = "/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
ROOT = "/home/user/afrigen/tutorials"
DOCS = f"{ROOT}/docs"
OUT = f"{ROOT}/seg_roles"
VP = {"width": 1600, "height": 900}
os.makedirs(OUT, exist_ok=True)

ACCOUNTS = {
    "client":   "client@nguzo.africa",
    "supplier": "supplier@nguzo.africa",
    "supplier2":"supplier2@nguzo.africa",
    "field":    "field@nguzo.africa",
    "admin":    "admin@nguzo.africa",
}

AGREE  = f"{DOCS}/Signed-Transport-Agreement-Nguzo.pdf"
MACH   = f"{DOCS}/Vehicle-Registration-Inspection-Certificate.pdf"
PERMIT = f"{DOCS}/TARURA-Transit-Permit.pdf"
TT     = f"{DOCS}/TT-Payment-SWIFT-Confirmation.pdf"

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

def beat(page, ms=1100): page.wait_for_timeout(ms)

def ensure_cursor(page):
    try: page.evaluate(CURSOR_JS)
    except Exception: pass

def center(page, selector, nth=0):
    loc = page.locator(selector).nth(nth)
    loc.scroll_into_view_if_needed(); page.wait_for_timeout(300)
    box = loc.bounding_box()
    if not box: raise RuntimeError(f"no box for {selector}")
    return loc, box["x"]+box["width"]/2, box["y"]+box["height"]/2

def move_to(page, x, y, settle=800):
    ensure_cursor(page)
    page.evaluate("([x,y])=>window.__nzMove(x,y)", [x,y])
    page.wait_for_timeout(settle)

def click_sel(page, selector, nth=0, settle=800, after=1100):
    loc, x, y = center(page, selector, nth)
    move_to(page, x, y, settle)
    page.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
    page.wait_for_timeout(180); loc.click(); page.wait_for_timeout(after)

def click_text(page, text, settle=800, after=1100, exact=False):
    loc = page.get_by_text(text, exact=exact).first
    loc.scroll_into_view_if_needed(); page.wait_for_timeout(300)
    box = loc.bounding_box()
    if box:
        x,y = box["x"]+box["width"]/2, box["y"]+box["height"]/2
        move_to(page, x, y, settle)
        page.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
        page.wait_for_timeout(180)
    loc.click(); page.wait_for_timeout(after)

def click_button(page, name, settle=800, after=1200):
    loc = page.get_by_role("button", name=name).first
    loc.scroll_into_view_if_needed(); page.wait_for_timeout(300)
    box = loc.bounding_box()
    if box:
        x,y = box["x"]+box["width"]/2, box["y"]+box["height"]/2
        move_to(page, x, y, settle)
        page.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
        page.wait_for_timeout(180)
    loc.click(); page.wait_for_timeout(after)

def type_into(page, selector, text, nth=0, settle=700):
    loc, x, y = center(page, selector, nth)
    move_to(page, x, y, settle)
    page.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
    loc.click(); page.wait_for_timeout(160)
    loc.fill(""); loc.type(text, delay=42); page.wait_for_timeout(600)

def scroll_tour(page, steps=3, dy=340, pause=1400):
    """Slowly scroll a page to reveal its sections."""
    for _ in range(steps):
        page.mouse.wheel(0, dy); beat(page, pause)

def goto(page, path, wait=1900):
    page.goto(BASE+path, wait_until="networkidle")
    ensure_cursor(page); page.wait_for_timeout(wait)

def login(ctx, email):
    page = ctx.new_page()
    page.goto(BASE+"/app", wait_until="networkidle")
    ensure_cursor(page)
    page.wait_for_selector('input[type="email"]', timeout=15000)
    beat(page, 800)
    type_into(page, 'input[type="email"]', email)
    type_into(page, 'input[type="password"]', PASS)
    click_sel(page, 'button[type="submit"]', after=3800)
    ensure_cursor(page)
    return page

def try_button(page, name, after=2400, timeout=4000):
    try:
        page.get_by_role("button", name=name).first.wait_for(state="visible", timeout=timeout)
        click_button(page, name, after=after); return True
    except Exception as e:
        print("   (skip)", name, type(e).__name__); return False


# ----------------------------------------------------------------------
# Headless helpers (NO recording) to drive backend state for demos
# ----------------------------------------------------------------------
def silent_ctx(browser):
    return browser.new_context(viewport=VP)

def api_login_page(browser, email):
    ctx = silent_ctx(browser)
    pg = ctx.new_page()
    pg.goto(BASE+"/app", wait_until="networkidle")
    pg.wait_for_selector('input[type="email"]', timeout=15000)
    pg.fill('input[type="email"]', email)
    pg.fill('input[type="password"]', PASS)
    pg.click('button[type="submit"]')
    pg.wait_for_timeout(2500)
    return ctx, pg

def setup_inspect_ready_tender(browser):
    """Create a fresh tender and drive it to MachineDocsUploaded (unrecorded),
    so the field role has a real job awaiting on-site inspection."""
    print(">> setup: creating inspect-ready tender (headless)")
    # client posts
    ctx, cc = api_login_page(browser, ACCOUNTS["client"])
    cc.goto(BASE+"/app", wait_until="networkidle"); cc.wait_for_timeout(1200)
    cc.get_by_role("button", name="Post a Job").first.click(); cc.wait_for_timeout(800)
    cc.get_by_text("Cargo transport").first.click(); cc.wait_for_timeout(500)
    cc.locator("select").first.select_option(label="Tipper Truck"); cc.wait_for_timeout(400)
    cc.locator('input[type="number"]').first.fill("3")
    cc.locator('input[placeholder*="river sand"]').first.fill("450t crushed aggregate for road base")
    # origin = the input with no type and no placeholder (first such)
    cc.locator('input:not([type="number"]):not([placeholder])').first.fill("Dar es Salaam")
    cc.locator('input[placeholder="e.g. Geita"]').first.fill("Dodoma")
    cc.locator('input[placeholder*="Auto-generated"]').first.fill("Aggregate haul — Dar es Salaam to Dodoma")
    cc.get_by_role("button", name="Post job & open for bids").first.click(); cc.wait_for_timeout(2500)
    r = cc.context.request.fetch(BASE+"/api/tenders")
    tid = r.json().get("tenders", [])[0]["id"]
    print("   inspect tender:", tid)
    ctx.close()

    # supplier1 bids
    ctx, sp = api_login_page(browser, ACCOUNTS["supplier"])
    sp.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); sp.wait_for_timeout(1200)
    sp.locator('input[type="number"]').nth(0).fill("3")
    sp.locator('input[type="number"]').nth(1).fill("680000")
    sp.get_by_role("button", name="Submit bid").first.click(); sp.wait_for_timeout(2000)
    ctx.close()

    # client confirms award
    ctx, cc = api_login_page(browser, ACCOUNTS["client"])
    cc.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); cc.wait_for_timeout(1500)
    cc.get_by_role("button", name="Confirm award").first.click(); cc.wait_for_timeout(2500)
    ctx.close()

    # supplier1 signs agreement + uploads machine docs -> MachineDocsUploaded
    ctx, sp = api_login_page(browser, ACCOUNTS["supplier"])
    sp.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); sp.wait_for_timeout(1500)
    try:
        sp.set_input_files('input[type="file"]', AGREE); sp.wait_for_timeout(1500)
        sp.get_by_role("button", name="Confirm agreement signed").first.click(); sp.wait_for_timeout(2000)
    except Exception as e: print("   (agree)", e)
    sp.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); sp.wait_for_timeout(1500)
    try:
        sp.set_input_files('input[type="file"]', MACH); sp.wait_for_timeout(1500)
        sp.get_by_role("button", name="Submit documents for inspection").first.click(); sp.wait_for_timeout(2000)
    except Exception as e: print("   (docs)", e)
    ctx.close()
    print("   tender driven to MachineDocsUploaded")
    return tid


def build_client_tender(browser, title, machine, desc, dest, units, price, to_stage):
    """Create a tender from the CLIENT account and drive it (headless) up to
    `to_stage` so the client demo can show its action steps live.
    Returns the tender id. to_stage in {'FieldVerified','PermitsVerified'}."""
    print(f">> setup: client tender '{title}' -> {to_stage}")
    # client posts (machinery demand)
    ctx, cc = api_login_page(browser, ACCOUNTS["client"])
    cc.goto(BASE+"/app/new", wait_until="networkidle"); cc.wait_for_timeout(1200)
    cc.get_by_role("button", name="Machinery rental").first.click(); cc.wait_for_timeout(900)
    # wait until the machine option is actually present in the select before choosing
    cc.wait_for_function(
        "(m) => Array.from(document.querySelectorAll('select option')).some(o => o.textContent.trim() === m)",
        arg=machine, timeout=8000)
    cc.locator("select").first.select_option(label=machine); cc.wait_for_timeout(400)
    cc.locator('input[type="number"]').first.fill(str(units))
    cc.locator('input[placeholder*="earthworks"]').first.fill(desc)
    cc.locator('input[placeholder="e.g. Geita"]').first.fill(dest)
    cc.locator('input[placeholder*="Auto-generated"]').first.fill(title)
    cc.get_by_role("button", name="Post job & open for bids").first.click(); cc.wait_for_timeout(2500)
    r = cc.context.request.fetch(BASE+"/api/tenders")
    tid = r.json().get("tenders", [])[0]["id"]
    print("   tender:", tid)
    ctx.close()

    # supplier bids full quantity
    ctx, sp = api_login_page(browser, ACCOUNTS["supplier"])
    sp.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); sp.wait_for_timeout(1200)
    sp.locator('input[type="number"]').nth(0).fill(str(units))
    sp.locator('input[type="number"]').nth(1).fill(str(price))
    sp.get_by_role("button", name="Submit bid").first.click(); sp.wait_for_timeout(2000)
    ctx.close()

    # client confirms award
    ctx, cc = api_login_page(browser, ACCOUNTS["client"])
    cc.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); cc.wait_for_timeout(1500)
    cc.get_by_role("button", name="Confirm award").first.click(); cc.wait_for_timeout(2500)
    ctx.close()

    # supplier signs agreement + uploads machine docs
    ctx, sp = api_login_page(browser, ACCOUNTS["supplier"])
    sp.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); sp.wait_for_timeout(1500)
    try:
        sp.set_input_files('input[type="file"]', AGREE); sp.wait_for_timeout(1500)
        sp.get_by_role("button", name="Confirm agreement signed").first.click(); sp.wait_for_timeout(2000)
    except Exception as e: print("   (agree)", e)
    sp.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); sp.wait_for_timeout(1500)
    try:
        sp.set_input_files('input[type="file"]', MACH); sp.wait_for_timeout(1500)
        sp.get_by_role("button", name="Submit documents for inspection").first.click(); sp.wait_for_timeout(2000)
    except Exception as e: print("   (docs)", e)
    ctx.close()

    # field verifies -> FieldVerified
    ctx, fp = api_login_page(browser, ACCOUNTS["field"])
    fp.goto(BASE+f"/app/inspect/{tid}", wait_until="networkidle"); fp.wait_for_timeout(1500)
    try:
        fp.locator('input[placeholder*="VIN"]').first.fill("CAT-330-2024-CH-71045")
        fp.locator("textarea").first.fill("VIN matches registration. Hydraulics firm, undercarriage 80%. Documents authentic.")
        fp.locator('input[type="checkbox"]').first.check(); fp.wait_for_timeout(500)
        fp.get_by_role("button", name="Verify & advance").first.click(); fp.wait_for_timeout(2500)
    except Exception as e: print("   (field)", e)
    ctx.close()

    if to_stage == "FieldVerified":
        print("   driven to FieldVerified"); return tid

    # client uploads permits -> PermitsUploaded
    ctx, cc = api_login_page(browser, ACCOUNTS["client"])
    cc.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); cc.wait_for_timeout(1500)
    try:
        cc.set_input_files('input[type="file"]', PERMIT); cc.wait_for_timeout(1500)
        cc.get_by_role("button", name="Submit permits for verification").first.click(); cc.wait_for_timeout(2000)
    except Exception as e: print("   (permits)", e)
    ctx.close()

    # admin verifies permits -> PermitsVerified
    ctx, ap = api_login_page(browser, ACCOUNTS["admin"])
    ap.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); ap.wait_for_timeout(1500)
    if not try_admin_advance(ap, tid, "permits-verified"):
        print("   (admin permits-verified fallback failed)")
    ap.wait_for_timeout(1500)
    ctx.close()
    print("   driven to PermitsVerified"); return tid


def try_admin_advance(pg, tid, step):
    """Admin advance via authenticated API fetch (Bearer token from localStorage)."""
    try:
        token = pg.evaluate("() => localStorage.getItem('bearer_token') || ''")
        r = pg.context.request.fetch(BASE+f"/api/tenders/{tid}/advance/{step}", method="POST",
                                     data="{}",
                                     headers={"content-type": "application/json",
                                              "authorization": f"Bearer {token}"})
        ok = r.status == 200
        print(f"   admin advance {step}: {r.status}")
        return ok
    except Exception as e:
        print("   (admin advance)", e); return False


# ----------------------------------------------------------------------
# Segment recorder
# ----------------------------------------------------------------------
class Recorder:
    def __init__(self, browser, role):
        self.browser = browser; self.role = role
        self.dir = f"{OUT}/{role}"; os.makedirs(self.dir, exist_ok=True)
        self.segs = {}

    def seg(self, sid, account=None):
        d = f"{self.dir}/{sid}"; os.makedirs(d, exist_ok=True)
        ctx = self.browser.new_context(viewport=VP, record_video_dir=d, record_video_size=VP)
        pg = login(ctx, ACCOUNTS[account or self.role])
        return ctx, pg, sid

    def finish(self, ctx, pg, sid):
        path = pg.video.path(); ctx.close(); self.segs[sid] = path
        print(f"SEG[{self.role}] {sid} -> {path}")

    def save(self):
        with open(f"{self.dir}/_segs.json", "w") as f:
            json.dump({"role": self.role, "segs": self.segs}, f, indent=2)
        print(f"SAVED {self.role}: {list(self.segs.keys())}")


# ======================================================================
# FIELD ROLE
# ======================================================================
def record_field(browser):
    inspect_tid = setup_inspect_ready_tender(browser)
    R = Recorder(browser, "field")

    # 1. Intro
    ctx, pg, sid = R.seg("intro")
    goto(pg, "/app"); beat(pg, 2600)
    # slow guided tour of the dashboard: glide down, pause to read, glide back
    for _ in range(3):
        pg.mouse.wheel(0, 200); beat(pg, 1700)
    beat(pg, 2200)
    for _ in range(3):
        pg.mouse.wheel(0, -200); beat(pg, 1700)
    beat(pg, 2200)
    # hover the nav items so the viewer learns the three sections
    for lbl in ["Inspections", "Yard Audits", "Border Log"]:
        try:
            box = pg.get_by_text(lbl, exact=True).first.bounding_box()
            if box:
                mx, my = box["x"]+box["width"]/2, box["y"]+box["height"]/2
                move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 1900)
        except Exception: pass
    beat(pg, 1800)
    R.finish(ctx, pg, sid)

    # 2. Reading the queue
    ctx, pg, sid = R.seg("awaiting")
    goto(pg, "/app"); beat(pg, 2200)
    # point at the awaiting job
    try:
        box = pg.get_by_text("Aggregate haul", exact=False).first.bounding_box()
        if box:
            mx, my = box["x"]+40, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2200)
    except Exception: pass
    # slide down to the other jobs and read their stage chips
    for _ in range(2):
        pg.mouse.wheel(0, 160); beat(pg, 1700)
    try:
        box = pg.get_by_text("Flatbeds", exact=False).first.bounding_box()
        if box:
            mx, my = box["x"]+40, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2000)
    except Exception: pass
    beat(pg, 1600)
    pg.mouse.wheel(0, -300); beat(pg, 1600)
    # hover the Inspect link last
    try:
        box = pg.get_by_text("Inspect").first.bounding_box()
        if box:
            mx, my = box["x"]+box["width"]/2, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2400)
    except Exception: pass
    beat(pg, 1600)
    R.finish(ctx, pg, sid)

    # 3. Open the job
    ctx, pg, sid = R.seg("open")
    goto(pg, "/app"); beat(pg, 2200)
    # show the cursor moving toward the awaiting card, then open the inspection by URL (reliable)
    try:
        box = pg.get_by_text("Aggregate haul", exact=False).first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]-90, box["y"]+box["height"]/2)
            pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+box['width']-90, box['y']+box['height']/2]); beat(pg, 1800)
    except Exception: pass
    goto(pg, f"/app/inspect/{inspect_tid}")
    beat(pg, 2400)
    # full guided tour of the opened inspection: hover each card header so the viewer learns the layout
    for lbl in ["Supplier documents", "VIN", "Mechanical", "On-site inspection passed"]:
        try:
            box = pg.get_by_text(lbl, exact=False).first.bounding_box()
            if box:
                mx, my = box["x"]+40, box["y"]+box["height"]/2
                move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2100)
        except Exception: pass
        pg.mouse.wheel(0, 150); beat(pg, 1400)
    beat(pg, 1600)
    for _ in range(3):
        pg.mouse.wheel(0, -200); beat(pg, 1500)
    # hover the Verify button to close on the action
    try:
        box = pg.get_by_role("button", name="Verify & advance").first.bounding_box()
        if box:
            mx, my = box["x"]+box["width"]/2, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2000)
    except Exception: pass
    beat(pg, 1600)
    R.finish(ctx, pg, sid)

    # 4. Review documents — slow dwell on each in-page document row (real submitted set)
    ctx, pg, sid = R.seg("review-docs")
    goto(pg, f"/app/inspect/{inspect_tid}"); beat(pg, 2400)
    # hover the section header first
    try:
        box = pg.get_by_text("Supplier documents", exact=False).first.bounding_box()
        if box:
            mx, my = box["x"]+60, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2200)
    except Exception: pass
    # dwell on each document row one at a time
    for txt in ["registration", "Signed agreement", "Fleet", "Machine"]:
        try:
            loc = pg.get_by_text(txt, exact=False).first
            if loc.count() == 0: continue
            box = loc.bounding_box()
            if box:
                mx, my = box["x"]+40, box["y"]+box["height"]/2
                move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2600)
                # glide cursor along the row to the View affordance on the right
                move_to(pg, box["x"]+box["width"]-30, my); beat(pg, 1500)
        except Exception: pass
    # hover each View affordance (do NOT click — opens a new tab Playwright can't record)
    try:
        cnt = pg.get_by_text("View", exact=False).count()
        for i in range(min(2, cnt)):
            box = pg.get_by_text("View", exact=False).nth(i).bounding_box()
            if box:
                mx, my = box["x"]+box["width"]/2, box["y"]+box["height"]/2
                move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2000)
    except Exception: pass
    # read the awarded supplier line
    try:
        box = pg.get_by_text("Awarded", exact=False).first.bounding_box()
        if box:
            mx, my = box["x"]+40, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2400)
    except Exception: pass
    pg.mouse.wheel(0, 160); beat(pg, 1700)
    pg.mouse.wheel(0, -160); beat(pg, 1700)
    beat(pg, 1400)
    R.finish(ctx, pg, sid)

    # 5. Capture VIN — slow, deliberate; show the field is editable
    ctx, pg, sid = R.seg("verify-vin")
    goto(pg, f"/app/inspect/{inspect_tid}"); beat(pg, 1800)
    # hover the VIN field label first
    try:
        box = pg.get_by_text("VIN", exact=False).first.bounding_box()
        if box:
            mx, my = box["x"]+30, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2200)
    except Exception: pass
    # type the chassis read slowly
    _, x, y = center(pg, 'input[placeholder*="VIN"]', 0)
    move_to(pg, x, y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [x,y])
    vinbox = pg.locator('input[placeholder*="VIN"]').first
    vinbox.click(); beat(pg, 500)
    vinbox.fill(""); vinbox.type("FAW-J6P-2024-CH-90233", delay=95); beat(pg, 2200)
    # correct it once to show it's editable (clear, retype the right plate)
    vinbox.fill(""); beat(pg, 600)
    vinbox.type("FAW-J6P-2024-CH-90237", delay=85); beat(pg, 2400)
    # hover the helper / placeholder area below
    try:
        box = pg.get_by_text("chassis", exact=False).first.bounding_box()
        if box:
            mx, my = box["x"]+30, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2200)
    except Exception: pass
    beat(pg, 2000)
    R.finish(ctx, pg, sid)

    # 6. Mechanical notes — write the honest record, then re-read it
    ctx, pg, sid = R.seg("verify-notes")
    goto(pg, f"/app/inspect/{inspect_tid}"); beat(pg, 1500)
    try: type_into(pg, 'input[placeholder*="VIN"]', "FAW-J6P-2024-CH-90237")
    except Exception: pass
    # hover the notes label
    try:
        box = pg.get_by_text("Mechanical", exact=False).first.bounding_box()
        if box:
            mx, my = box["x"]+30, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 1900)
    except Exception: pass
    nb = pg.locator("textarea").first
    _,x,y = center(pg, "textarea", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
    nb.click()
    nb.type("Engine: 3,180 hrs, starts clean, no smoke. Hydraulics firm, no visible leaks. Undercarriage 70 percent. Tyres serviceable. Chassis VIN matches registration. Ownership documents authentic and current.", delay=13)
    beat(pg, 2400)
    # scroll up to re-read the VIN, then back to the notes (shows the full record)
    pg.mouse.wheel(0, -220); beat(pg, 2000)
    try:
        box = pg.locator('input[placeholder*="VIN"]').first.bounding_box()
        if box:
            move_to(pg, box["x"]+40, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+40, box['y']+box['height']/2]); beat(pg, 1900)
    except Exception: pass
    pg.mouse.wheel(0, 220); beat(pg, 2000)
    # glide along the typed note
    try:
        box = pg.locator("textarea").first.bounding_box()
        if box:
            move_to(pg, box["x"]+60, box["y"]+box["height"]/2); beat(pg, 1700)
            move_to(pg, box["x"]+box["width"]-60, box["y"]+box["height"]/2); beat(pg, 1700)
    except Exception: pass
    beat(pg, 1800)
    R.finish(ctx, pg, sid)

    # 7. Sign and advance — deliberate: read the attestation, tick, then release
    ctx, pg, sid = R.seg("verify-advance")
    goto(pg, f"/app/inspect/{inspect_tid}"); beat(pg, 1500)
    try: type_into(pg, 'input[placeholder*="VIN"]', "FAW-J6P-2024-CH-90237")
    except Exception: pass
    nb = pg.locator("textarea").first
    _,x,y = center(pg, "textarea", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
    nb.click(); nb.type("VIN matches registration. Mechanically sound. Documents authentic. Approved.", delay=14)
    beat(pg, 1800)
    # hover/read the attestation label before ticking
    try:
        box = pg.get_by_text("On-site inspection passed", exact=False).first.bounding_box()
        if box:
            move_to(pg, box["x"]+40, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+40, box['y']+box['height']/2]); beat(pg, 2400)
    except Exception: pass
    click_sel(pg, 'input[type="checkbox"]', after=1800)
    # hover the now-enabled button, pause, then commit
    try:
        box = pg.get_by_role("button", name="Verify & advance").first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); beat(pg, 1900)
    except Exception: pass
    click_button(pg, "Verify & advance", after=3800)
    beat(pg, 2600)
    R.finish(ctx, pg, sid)

    # 8. Yard Audit form
    ctx, pg, sid = R.seg("audits-form")
    goto(pg, "/app/audits"); beat(pg, 2400)
    try:
        sel = pg.locator("select").first
        _,x,y = center(pg, "select", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y]); beat(pg, 700)
        if sel.locator("option").count() > 1:
            sel.select_option(index=1); beat(pg, 1200)
    except Exception as e: print("  (audit select)", e)
    try: type_into(pg, 'input[placeholder*="VIN"]', "CAT-320D-2023-YRD-4471")
    except Exception: pass
    try:
        nb = pg.locator("textarea").first
        _,x,y = center(pg, "textarea", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        nb.click(); nb.type("Yard audit: 5,400 hrs, hydraulics good, tracks 60 percent, no leaks. Plant registration verified against chassis.", delay=11)
        beat(pg, 800)
    except Exception: pass
    try: click_sel(pg, 'input[type="checkbox"]', after=1000)
    except Exception: pass
    try: click_button(pg, "Sign off audit", after=3200)
    except Exception as e: print("  (sign off)", e)
    beat(pg, 1800)
    R.finish(ctx, pg, sid)

    # 9. Yard Audit history — read each entry in the Recent audits list, one by one
    ctx, pg, sid = R.seg("audits-history")
    goto(pg, "/app/audits"); beat(pg, 2200)
    # hover the section header first
    try:
        box = pg.get_by_text("Recent audits", exact=False).first.bounding_box()
        if box:
            move_to(pg, box["x"]+60, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+60, box['y']+box['height']/2]); beat(pg, 2000)
    except Exception: pass
    # scroll the list into view gradually
    for _ in range(3):
        pg.mouse.wheel(0, 170); beat(pg, 1600)
    # dwell on each "Verified" pill row (seed has 2 + the one we just signed off = 3)
    try:
        n = min(3, pg.get_by_text("Verified", exact=False).count())
        for i in range(n):
            box = pg.get_by_text("Verified", exact=False).nth(i).bounding_box()
            if box:
                # glide across the whole row first (note text on the left)
                move_to(pg, box["x"]-260, box["y"]+box["height"]/2); beat(pg, 1500)
                move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+box['width']/2, box['y']+box['height']/2]); beat(pg, 2300)
    except Exception: pass
    beat(pg, 1600)
    for _ in range(3):
        pg.mouse.wheel(0, -200); beat(pg, 1600)
    R.finish(ctx, pg, sid)

    # 10. Border Log form — deliberate, field by field
    ctx, pg, sid = R.seg("border-form")
    goto(pg, "/app/border"); beat(pg, 2400)
    # hover the page intro so the viewer knows what this section is for
    try:
        box = pg.get_by_text("institutional wait", exact=False).first.bounding_box()
        if box:
            move_to(pg, box["x"]+60, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+60, box['y']+box['height']/2]); beat(pg, 2200)
    except Exception: pass
    # OSBP dropdown — hover label, open/select to show the post options
    try:
        box = pg.get_by_text("One-Stop Border Post", exact=False).first.bounding_box()
        if box:
            move_to(pg, box["x"]+40, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+40, box['y']+box['height']/2]); beat(pg, 1900)
    except Exception: pass
    try:
        sel = pg.locator("select").first
        _,x,y = center(pg, "select", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y]); beat(pg, 900)
        sel.select_option(label="Namanga"); beat(pg, 1100)
        sel.select_option(label="Tunduma"); beat(pg, 1300)
    except Exception as e: print("  (osbp)", e)
    # wait-minutes field — hover label, type slowly
    try:
        box = pg.get_by_text("Institutional wait", exact=False).first.bounding_box()
        if box:
            move_to(pg, box["x"]+40, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+40, box['y']+box['height']/2]); beat(pg, 1600)
    except Exception: pass
    try:
        nf = pg.locator('input[type="number"]').first
        _,x,y = center(pg, 'input[type="number"]', 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        nf.click(); nf.fill(""); nf.type("165", delay=180); beat(pg, 1700)
    except Exception: pass
    # override note — the real value of a human at the border
    try:
        box = pg.get_by_text("Clearance override", exact=False).first.bounding_box()
        if box:
            move_to(pg, box["x"]+40, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+40, box['y']+box['height']/2]); beat(pg, 1500)
    except Exception: pass
    try:
        nb = pg.locator("textarea").first
        _,x,y = center(pg, "textarea", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        nb.click(); nb.type("Clearance portal timed out. Re-validated TANSAD manually with the customs desk officer. Load released same day.", delay=13)
        beat(pg, 1600)
    except Exception: pass
    # hover the button, pause, then log
    try:
        box = pg.get_by_role("button", name="Log entry").first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); beat(pg, 1500)
    except Exception: pass
    try: click_button(pg, "Log entry", after=3000)
    except Exception as e: print("  (log entry)", e)
    # dwell on the freshly saved entry appearing in the list below
    beat(pg, 1600)
    pg.mouse.wheel(0, 220); beat(pg, 2200)
    pg.mouse.wheel(0, -220); beat(pg, 1800)
    R.finish(ctx, pg, sid)

    # 11. Border Log history
    ctx, pg, sid = R.seg("border-history")
    goto(pg, "/app/border"); beat(pg, 2600)
    # scroll down into the recent logs and read each entry slowly
    for _ in range(3):
        pg.mouse.wheel(0, 190); beat(pg, 1900)
    try:
        n = min(3, pg.get_by_text("min wait", exact=False).count())
        for i in range(n):
            box = pg.get_by_text("min wait", exact=False).nth(i).bounding_box()
            if box:
                mx, my = box["x"]-120, box["y"]+box["height"]/2
                move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2300)
    except Exception: pass
    beat(pg, 1800)
    for _ in range(2):
        pg.mouse.wheel(0, -200); beat(pg, 1800)
    # hover the form once more to close on the action
    try:
        box = pg.get_by_text("Border Liaison Log", exact=False).first.bounding_box()
        if box:
            mx, my = box["x"]+60, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my]); beat(pg, 2200)
    except Exception: pass
    beat(pg, 2000)
    R.finish(ctx, pg, sid)

    R.save()


# ======================================================================
# CLIENT ROLE
# ======================================================================
def post_machinery_tender(browser, title, machine, desc, dest, units):
    """Client posts a machinery tender. Returns tid. Stays at Bidding."""
    ctx, cc = api_login_page(browser, ACCOUNTS["client"])
    cc.goto(BASE+"/app/new", wait_until="networkidle"); cc.wait_for_timeout(1200)
    cc.get_by_role("button", name="Machinery rental").first.click(); cc.wait_for_timeout(900)
    # wait until the machine option is actually present in the select before choosing
    cc.wait_for_function(
        "(m) => Array.from(document.querySelectorAll('select option')).some(o => o.textContent.trim() === m)",
        arg=machine, timeout=8000)
    cc.locator("select").first.select_option(label=machine); cc.wait_for_timeout(400)
    cc.locator('input[type="number"]').first.fill(str(units))
    cc.locator('input[placeholder*="earthworks"]').first.fill(desc)
    cc.locator('input[placeholder="e.g. Geita"]').first.fill(dest)
    cc.locator('input[placeholder*="Auto-generated"]').first.fill(title)
    cc.get_by_role("button", name="Post job & open for bids").first.click(); cc.wait_for_timeout(2500)
    r = cc.context.request.fetch(BASE+"/api/tenders")
    tid = r.json().get("tenders", [])[0]["id"]
    print(f"   tender '{title}':", tid)
    ctx.close()
    return tid


def supplier_bid(browser, tid, units, price, who="supplier"):
    ctx, sp = api_login_page(browser, ACCOUNTS[who])
    sp.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); sp.wait_for_timeout(1200)
    sp.locator('input[type="number"]').nth(0).fill(str(units))
    sp.locator('input[type="number"]').nth(1).fill(str(price))
    sp.get_by_role("button", name="Submit bid").first.click(); sp.wait_for_timeout(2000)
    ctx.close()


def client_confirm_award(browser, tid):
    ctx, cc = api_login_page(browser, ACCOUNTS["client"])
    cc.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); cc.wait_for_timeout(1500)
    cc.get_by_role("button", name="Confirm award").first.click(); cc.wait_for_timeout(2500)
    ctx.close()


def supplier_sign_agreement(browser, tid, who="supplier"):
    ctx, sp = api_login_page(browser, ACCOUNTS[who])
    sp.goto(BASE+f"/app/job/{tid}", wait_until="networkidle"); sp.wait_for_timeout(1500)
    try:
        sp.set_input_files('input[type="file"]', AGREE); sp.wait_for_timeout(1500)
        sp.get_by_role("button", name="Confirm agreement signed").first.click(); sp.wait_for_timeout(2000)
    except Exception as e: print("   (agree)", e)
    ctx.close()


def setup_supplier_tenders(browser):
    """Stage three machinery tenders the supplier will act on live:
       - BID  tender: open at Bidding (supplier places a bid on camera)
       - SIGN tender: at AwardConfirmed (supplier signs agreement on camera)
       - DOCS tender: at AgreementsSigned (supplier uploads fleet docs on camera)
    Returns (bid_tid, sign_tid, docs_tid)."""
    print(">> setup: supplier tenders")
    bid_tid = post_machinery_tender(
        browser, "Excavator hire — Geita gold site", "Excavator",
        "Two excavators for overburden stripping and bench works", "Geita", 2)

    sign_tid = post_machinery_tender(
        browser, "Grader & roller — Mbeya road base", "Motor Grader",
        "Grading and compaction of access road base", "Mbeya", 2)
    supplier_bid(browser, sign_tid, 2, 870000)
    client_confirm_award(browser, sign_tid)  # -> AwardConfirmed

    docs_tid = post_machinery_tender(
        browser, "Mobile crane hire — Mwanza port works", "Mobile Crane",
        "Two mobile cranes for port lifting and plant relocation", "Mwanza", 2)
    supplier_bid(browser, docs_tid, 2, 1150000)
    client_confirm_award(browser, docs_tid)            # -> AwardConfirmed
    supplier_sign_agreement(browser, docs_tid)          # -> AgreementsSigned
    print(f"   bid={bid_tid} sign={sign_tid} docs={docs_tid}")
    return bid_tid, sign_tid, docs_tid


def record_supplier(browser):
    bid_tid, sign_tid, docs_tid = setup_supplier_tenders(browser)

    R = Recorder(browser, "supplier")

    def ripple_at(pg, box, ox=40):
        if box:
            mx, my = box["x"]+ox, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my])

    def hover_text(pg, txt, ox=40, pause=2100, exact=False):
        try:
            loc = pg.get_by_text(txt, exact=exact).first
            if loc.count() == 0: return
            ripple_at(pg, loc.bounding_box(), ox); beat(pg, pause)
        except Exception: pass

    def slow_scroll(pg, dy, steps=3, pause=1700):
        for _ in range(steps):
            pg.mouse.wheel(0, dy); beat(pg, pause)

    # 1. Intro — Jobs dashboard + KPI counters  (VO 36s)
    ctx, pg, sid = R.seg("intro")
    goto(pg, "/app"); beat(pg, 2800)
    for lbl in ["Open to bid", "My awards", "Executing", "Bids placed"]:
        hover_text(pg, lbl, ox=30, pause=2200, exact=False)
    beat(pg, 1200)
    for lbl in ["Jobs", "Fleet", "Escrow Vault", "Report Breakdown"]:
        hover_text(pg, lbl, ox=20, pause=2100, exact=True)
    for lbl in ["Open to bid", "My awards", "Executing", "Bids placed"]:
        hover_text(pg, lbl, ox=30, pause=2000, exact=False)
    slow_scroll(pg, 150, steps=2, pause=2000)
    slow_scroll(pg, -150, steps=2, pause=1900)
    beat(pg, 2200)
    R.finish(ctx, pg, sid)

    # 2. Open Tenders list  (VO 28s)
    ctx, pg, sid = R.seg("open-tenders")
    goto(pg, "/app"); beat(pg, 2600)
    hover_text(pg, "Open Tenders", ox=40, pause=2400)
    hover_text(pg, "Excavator hire", ox=40, pause=2600)
    slow_scroll(pg, 150, steps=2, pause=2000)
    hover_text(pg, "Grader", ox=40, pause=2200)
    hover_text(pg, "Domestic", ox=20, pause=2200)
    slow_scroll(pg, 130, steps=2, pause=2000)
    slow_scroll(pg, -130, steps=2, pause=1900)
    hover_text(pg, "Open Tenders", ox=40, pause=2200)
    beat(pg, 2400)
    R.finish(ctx, pg, sid)

    # 3. Place a bid — units + price/unit  (VO 36s)
    ctx, pg, sid = R.seg("place-bid")
    goto(pg, f"/app/job/{bid_tid}"); beat(pg, 2600)
    hover_text(pg, "Place your bid", ox=40, pause=2600)
    hover_text(pg, "auto-fill", ox=30, pause=2200)
    try:
        nf = pg.locator('input[type="number"]').nth(0)
        _,x,y = center(pg, 'input[type="number"]', 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        nf.click(); nf.fill(""); nf.type("2", delay=240); beat(pg, 1900)
    except Exception as e: print("  (units)", e)
    try:
        pf = pg.locator('input[type="number"]').nth(1)
        _,x,y = center(pg, 'input[type="number"]', 1); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        pf.click(); pf.fill(""); pf.type("910000", delay=120); beat(pg, 2000)
    except Exception as e: print("  (price)", e)
    try:
        box = pg.get_by_role("button", name="Submit bid").first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+box['width']/2, box['y']+box['height']/2]); beat(pg, 2000)
    except Exception: pass
    try: click_button(pg, "Submit bid", after=3200)
    except Exception as e: print("  (submit bid)", e)
    hover_text(pg, "Your current bid", ox=30, pause=2600)
    beat(pg, 2400)
    R.finish(ctx, pg, sid)

    # 4. My Awards + stage tracker + flat fair price  (VO 29s)
    ctx, pg, sid = R.seg("my-awards")
    goto(pg, "/app"); beat(pg, 2200)
    hover_text(pg, "My Awards", ox=40, pause=2200)
    try: click_text(pg, "Grader & roller", after=2600)
    except Exception: pass
    hover_text(pg, "Your award", ox=40, pause=2600)
    hover_text(pg, "flat fair", ox=30, pause=2400)
    slow_scroll(pg, 150, steps=2, pause=2000)
    slow_scroll(pg, -150, steps=2, pause=1900)
    hover_text(pg, "Your award", ox=40, pause=2200)
    beat(pg, 2200)
    R.finish(ctx, pg, sid)

    # 5. Sign the agreement  (VO 30s)
    ctx, pg, sid = R.seg("agreement")
    goto(pg, f"/app/job/{sign_tid}"); beat(pg, 2600)
    hover_text(pg, "Your award", ox=40, pause=2200)
    hover_text(pg, "Signed agreement", ox=30, pause=2400)
    try:
        pg.set_input_files('input[type="file"]', AGREE); beat(pg, 2200)
    except Exception as e: print("  (agree upload)", e)
    try:
        box = pg.get_by_role("button", name="Confirm agreement signed").first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+box['width']/2, box['y']+box['height']/2]); beat(pg, 2200)
    except Exception: pass
    slow_scroll(pg, 130, steps=2, pause=2000)
    slow_scroll(pg, -130, steps=2, pause=1900)
    hover_text(pg, "Signed agreement", ox=30, pause=2200)
    beat(pg, 2200)
    R.finish(ctx, pg, sid)

    # 6. Upload fleet documents  (VO 30s)
    ctx, pg, sid = R.seg("fleet-docs")
    goto(pg, f"/app/job/{docs_tid}"); beat(pg, 2600)
    hover_text(pg, "Machine / fleet docs", ox=40, pause=2600)
    hover_text(pg, "registration", ox=30, pause=2200)
    try:
        pg.set_input_files('input[type="file"]', MACH); beat(pg, 2200)
    except Exception as e: print("  (docs upload)", e)
    try:
        box = pg.get_by_role("button", name="Submit documents for inspection").first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+box['width']/2, box['y']+box['height']/2]); beat(pg, 2200)
    except Exception: pass
    slow_scroll(pg, 130, steps=2, pause=2000)
    slow_scroll(pg, -130, steps=2, pause=1900)
    hover_text(pg, "Machine / fleet docs", ox=40, pause=2200)
    beat(pg, 2200)
    R.finish(ctx, pg, sid)

    # 7. Fleet Configuration  (VO 30s)
    ctx, pg, sid = R.seg("fleet")
    goto(pg, "/app/fleet"); beat(pg, 2600)
    hover_text(pg, "Fleet Configuration", ox=40, pause=2400)
    for lbl in ["Assets", "Available", "Active", "Breakdown"]:
        hover_text(pg, lbl, ox=30, pause=2000, exact=False)
    slow_scroll(pg, 170, steps=3, pause=2000)
    slow_scroll(pg, -170, steps=2, pause=1900)
    hover_text(pg, "Fleet Configuration", ox=40, pause=2200)
    beat(pg, 2200)
    R.finish(ctx, pg, sid)

    # 8. Add Asset modal  (VO 32s)
    ctx, pg, sid = R.seg("add-asset")
    goto(pg, "/app/fleet"); beat(pg, 2200)
    try: click_button(pg, "Add Asset", after=2200)
    except Exception as e: print("  (open add)", e)
    hover_text(pg, "Add Asset", ox=40, pause=1800)
    try:
        _,x,y = center(pg, "select", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y]); beat(pg, 1100)
        pg.locator("select").first.select_option(label="Tipper Truck"); beat(pg, 1500)
    except Exception as e: print("  (type)", e)
    try:
        f = pg.locator('input[placeholder*="Caterpillar"]').first
        _,x,y = center(pg, 'input[placeholder*="Caterpillar"]', 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        f.click(); f.type("FAW", delay=120); beat(pg, 1300)
    except Exception: pass
    try:
        f = pg.locator('input[placeholder*="320D"]').first
        f.click(); f.type("J6 8x4", delay=90); beat(pg, 1300)
    except Exception: pass
    try:
        f = pg.locator('input[placeholder*="Vingunguti"]').first
        _,x,y = center(pg, 'input[placeholder*="Vingunguti"]', 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        f.click(); f.type("Vingunguti yard, Dar", delay=40); beat(pg, 1600)
    except Exception: pass
    hover_text(pg, "Engine serial", ox=40, pause=2000)
    hover_text(pg, "VIN", ox=40, pause=2200)
    hover_text(pg, "Save asset", ox=30, pause=2200)
    beat(pg, 2200)
    R.finish(ctx, pg, sid)

    # 9. Escrow Vault  (VO 30s)
    ctx, pg, sid = R.seg("vault")
    goto(pg, "/app/vault"); beat(pg, 2600)
    hover_text(pg, "Escrow Vault", ox=40, pause=2600)
    hover_text(pg, "released on client", ox=30, pause=2400)
    slow_scroll(pg, 160, steps=3, pause=2000)
    slow_scroll(pg, -160, steps=2, pause=1900)
    hover_text(pg, "Escrow Vault", ox=40, pause=2200)
    beat(pg, 2400)
    R.finish(ctx, pg, sid)

    # 10. Report Breakdown  (VO 30s)
    ctx, pg, sid = R.seg("breakdown")
    goto(pg, "/app/breakdown"); beat(pg, 2600)
    hover_text(pg, "Report Breakdown", ox=40, pause=2400)
    hover_text(pg, "stranded asset", ox=30, pause=2400)
    try:
        sel = pg.locator("select").first
        _,x,y = center(pg, "select", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y]); beat(pg, 1400)
    except Exception: pass
    try:
        pg.locator("select").nth(1).click(); beat(pg, 1200)
    except Exception: pass
    hover_text(pg, "Dispatch Result", ox=40, pause=2400)
    slow_scroll(pg, 130, steps=2, pause=2000)
    slow_scroll(pg, -130, steps=2, pause=1900)
    hover_text(pg, "Report Breakdown", ox=40, pause=2200)
    beat(pg, 2200)
    R.finish(ctx, pg, sid)

    # 11. Close — overview glide of Jobs  (VO 27s)
    ctx, pg, sid = R.seg("close")
    goto(pg, "/app"); beat(pg, 2600)
    for lbl in ["Open to bid", "My awards", "Executing", "Bids placed"]:
        hover_text(pg, lbl, ox=30, pause=2100, exact=False)
    slow_scroll(pg, 160, steps=2, pause=2000)
    slow_scroll(pg, -160, steps=2, pause=2000)
    beat(pg, 2800)
    R.finish(ctx, pg, sid)

    R.save()


def record_client(browser):
    # Stage two real tenders for the client's action steps.
    fv_tid = build_client_tender(
        browser, "Foundation earthworks — Dodoma site", "Excavator",
        "Bulk earthworks and trenching for warehouse foundation", "Dodoma", 2, 920000, "FieldVerified")
    pv_tid = build_client_tender(
        browser, "Road base grading — Morogoro", "Motor Grader",
        "Grading and compaction of 4km access road base", "Morogoro", 2, 880000, "PermitsVerified")

    R = Recorder(browser, "client")

    def ripple_at(pg, box, ox=40):
        if box:
            mx, my = box["x"]+ox, box["y"]+box["height"]/2
            move_to(pg, mx, my); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [mx,my])

    def hover_text(pg, txt, ox=40, pause=2100, exact=False):
        try:
            loc = pg.get_by_text(txt, exact=exact).first
            if loc.count() == 0: return
            ripple_at(pg, loc.bounding_box(), ox); beat(pg, pause)
        except Exception: pass

    def slow_scroll(pg, dy, steps=3, pause=1500):
        for _ in range(steps):
            pg.mouse.wheel(0, dy); beat(pg, pause)

    # 1. Intro — tour the My Jobs dashboard + the KPI counters  (VO 47s)
    ctx, pg, sid = R.seg("intro")
    goto(pg, "/app"); beat(pg, 2800)
    for lbl in ["Total Jobs", "Taking Bids", "In Execution", "Completed"]:
        hover_text(pg, lbl, ox=30, pause=2100, exact=False)
    beat(pg, 1400)
    slow_scroll(pg, 170, steps=3, pause=1900)
    slow_scroll(pg, -170, steps=3, pause=1900)
    # hover the nav items, dwell on each
    for lbl in ["My Jobs", "Post a Job"]:
        hover_text(pg, lbl, ox=20, pause=2200, exact=True)
    # second pass over the KPI row to fill time
    for lbl in ["Total Jobs", "Taking Bids", "In Execution", "Completed"]:
        hover_text(pg, lbl, ox=30, pause=2200, exact=False)
    slow_scroll(pg, 150, steps=2, pause=2000)
    slow_scroll(pg, -150, steps=2, pause=2000)
    beat(pg, 2600)
    R.finish(ctx, pg, sid)

    # 2. Reading a job — the stage tracker  (VO 43s)
    ctx, pg, sid = R.seg("read-stage")
    goto(pg, "/app"); beat(pg, 2600)
    hover_text(pg, "Foundation earthworks", ox=40, pause=2600)
    slow_scroll(pg, 150, steps=2, pause=1900)
    hover_text(pg, "Road base grading", ox=40, pause=2400)
    hover_text(pg, "Domestic", ox=20, pause=2200)
    slow_scroll(pg, 150, steps=2, pause=1900)
    # open one job to reveal the full stage tracker and dwell on it
    try: click_text(pg, "Foundation earthworks", after=2600)
    except Exception: pass
    hover_text(pg, "Stage", ox=30, pause=2400, exact=False)
    slow_scroll(pg, 160, steps=3, pause=2100)
    slow_scroll(pg, -160, steps=3, pause=2000)
    hover_text(pg, "Stage", ox=30, pause=2400, exact=False)
    beat(pg, 2400)
    R.finish(ctx, pg, sid)

    # 3. Post a job — choose what you need  (VO 27s)
    ctx, pg, sid = R.seg("post-type")
    goto(pg, "/app/new"); beat(pg, 2600)
    hover_text(pg, "What do you need", ox=40, pause=2400)
    hover_text(pg, "Cargo", ox=30, pause=2200)
    hover_text(pg, "Machinery", ox=30, pause=2000)
    try:
        click_text(pg, "Machinery", after=2000)
    except Exception: pass
    beat(pg, 1600)
    hover_text(pg, "What do you need", ox=40, pause=2200)
    hover_text(pg, "Machinery", ox=30, pause=2200)
    beat(pg, 3000)
    R.finish(ctx, pg, sid)

    # 4. Post a job — fill type, units, route, origin/dest  (VO 40s)
    ctx, pg, sid = R.seg("post-details")
    goto(pg, "/app/new"); beat(pg, 2200)
    try: click_text(pg, "Machinery", after=1100)
    except Exception: pass
    try:
        _,x,y = center(pg, "select", 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y]); beat(pg, 1100)
        pg.locator("select").first.select_option(label="Excavator"); beat(pg, 1800)
    except Exception as e: print("  (machine type)", e)
    try:
        nf = pg.locator('input[type="number"]').first
        _,x,y = center(pg, 'input[type="number"]', 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        nf.click(); nf.fill(""); nf.type("3", delay=220); beat(pg, 1800)
    except Exception: pass
    try:
        df = pg.locator('input[placeholder*="earthworks"]').first
        _,x,y = center(pg, 'input[placeholder*="earthworks"]', 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        df.click(); df.type("Bulk earthworks for a new warehouse foundation", delay=34); beat(pg, 1800)
    except Exception: pass
    hover_text(pg, "Transit classification", ox=40, pause=2000)
    hover_text(pg, "Domestic", ox=20, pause=1900)
    try:
        dest = pg.locator('input[placeholder="e.g. Geita"]').first
        _,x,y = center(pg, 'input[placeholder="e.g. Geita"]', 0); move_to(pg,x,y); pg.evaluate("([x,y])=>window.__nzRipple(x,y)",[x,y])
        dest.click(); dest.fill(""); dest.type("Dodoma", delay=110); beat(pg, 1800)
    except Exception: pass
    slow_scroll(pg, 150, steps=3, pause=1900)
    slow_scroll(pg, -150, steps=3, pause=1800)
    beat(pg, 2800)
    R.finish(ctx, pg, sid)

    # 5. Post a job — read how-it-works panel + submit  (VO 32s)
    ctx, pg, sid = R.seg("post-submit")
    goto(pg, "/app/new"); beat(pg, 2000)
    try: click_text(pg, "Machinery", after=900)
    except Exception: pass
    try:
        pg.locator("select").first.select_option(label="Excavator"); beat(pg, 900)
        pg.locator('input[placeholder*="earthworks"]').first.fill("Bulk earthworks for warehouse foundation")
        pg.locator('input[placeholder="e.g. Geita"]').first.fill("Dodoma")
        pg.locator('input[placeholder*="Auto-generated"]').first.fill("Foundation earthworks — Dodoma (demo)")
    except Exception as e: print("  (fill)", e)
    for s in ["Suppliers bid", "auto-fill", "confirm the award", "Staged gate"]:
        hover_text(pg, s, ox=30, pause=2000)
    try:
        box = pg.get_by_role("button", name="Post job & open for bids").first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); beat(pg, 1800)
    except Exception: pass
    try: click_button(pg, "Post job & open for bids", after=3800)
    except Exception as e: print("  (submit)", e)
    beat(pg, 2000)
    hover_text(pg, "Taking Bids", ox=30, pause=2400, exact=False)
    beat(pg, 2600)
    R.finish(ctx, pg, sid)

    # 6. Review bids + confirm award  (VO 36s)
    ctx, pg, sid = R.seg("bids-award")
    goto(pg, f"/app/job/{fv_tid}"); beat(pg, 2600)
    hover_text(pg, "Awarded Suppliers", ox=60, pause=2400)
    try:
        box = pg.locator("text=Award").first.bounding_box()
        ripple_at(pg, box, 20); beat(pg, 2200)
    except Exception: pass
    hover_text(pg, "flat fair price", ox=30, pause=2600)
    slow_scroll(pg, 160, steps=3, pause=1800)
    slow_scroll(pg, -160, steps=3, pause=1700)
    hover_text(pg, "Awarded Suppliers", ox=60, pause=2200)
    hover_text(pg, "flat fair price", ox=30, pause=2600)
    slow_scroll(pg, 150, steps=2, pause=2000)
    slow_scroll(pg, -150, steps=2, pause=1900)
    beat(pg, 2400)
    R.finish(ctx, pg, sid)

    # 7. Awarded suppliers detail  (VO 32s)
    ctx, pg, sid = R.seg("awarded")
    goto(pg, f"/app/job/{fv_tid}"); beat(pg, 2400)
    hover_text(pg, "Awarded Suppliers", ox=60, pause=2200)
    hover_text(pg, "unit", ox=40, pause=2600)
    hover_text(pg, "total", ox=30, pause=2200)
    slow_scroll(pg, 170, steps=2, pause=1800)
    slow_scroll(pg, -170, steps=2, pause=1700)
    hover_text(pg, "Awarded Suppliers", ox=60, pause=2200)
    hover_text(pg, "unit", ox=40, pause=2400)
    slow_scroll(pg, 160, steps=2, pause=2000)
    slow_scroll(pg, -160, steps=2, pause=1900)
    beat(pg, 2600)
    R.finish(ctx, pg, sid)

    # 8. Permits step  (VO 34s)
    ctx, pg, sid = R.seg("permits")
    goto(pg, f"/app/job/{fv_tid}"); beat(pg, 2600)
    hover_text(pg, "Upload permits", ox=40, pause=2400)
    hover_text(pg, "Field inspection cleared", ox=30, pause=2200)
    try:
        pg.set_input_files('input[type="file"]', PERMIT); beat(pg, 2200)
    except Exception as e: print("  (permit upload)", e)
    try:
        box = pg.get_by_role("button", name="Submit permits for verification").first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+box['width']/2, box['y']+box['height']/2]); beat(pg, 2400)
    except Exception: pass
    hover_text(pg, "Field inspection cleared", ox=30, pause=2400)
    slow_scroll(pg, 140, steps=3, pause=2000)
    slow_scroll(pg, -140, steps=3, pause=1900)
    hover_text(pg, "Upload permits", ox=40, pause=2400)
    beat(pg, 2400)
    R.finish(ctx, pg, sid)

    # 9. Payment & escrow step  (VO 36s)
    ctx, pg, sid = R.seg("payment")
    goto(pg, f"/app/job/{pv_tid}"); beat(pg, 2600)
    hover_text(pg, "Payment proof", ox=40, pause=2200)
    hover_text(pg, "Escrow preview", ox=30, pause=2600)
    hover_text(pg, "funds tracked", ox=30, pause=2400)
    try:
        pg.set_input_files('input[type="file"]', TT); beat(pg, 2200)
    except Exception as e: print("  (tt upload)", e)
    try:
        box = pg.get_by_role("button", name="Submit payment proof").first.bounding_box()
        if box:
            move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+box['width']/2, box['y']+box['height']/2]); beat(pg, 2400)
    except Exception: pass
    slow_scroll(pg, 150, steps=3, pause=1900)
    slow_scroll(pg, -150, steps=3, pause=1800)
    beat(pg, 2800)
    R.finish(ctx, pg, sid)

    # 10. Track & message  (VO 32s) — already OK length, keep
    ctx, pg, sid = R.seg("track")
    goto(pg, f"/app/job/{pv_tid}"); beat(pg, 2200)
    hover_text(pg, "Status", ox=30, pause=2000, exact=True)
    hover_text(pg, "Messages", ox=30, pause=1900, exact=True)
    try:
        msg = pg.get_by_placeholder("Message").first
        if msg.count() > 0:
            box = msg.bounding_box()
            if box:
                move_to(pg, box["x"]+box["width"]/2, box["y"]+box["height"]/2); pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [box['x']+box['width']/2, box['y']+box['height']/2])
            msg.click(); msg.type("Thank you — looking forward to getting this moving.", delay=22); beat(pg, 1800)
    except Exception as e: print("  (msg)", e)
    hover_text(pg, "Activity", ox=30, pause=2400, exact=True)
    pg.mouse.wheel(0, 240); beat(pg, 2200)
    hover_text(pg, "Documents", ox=30, pause=2400)
    pg.mouse.wheel(0, 180); beat(pg, 2200)
    hover_text(pg, "Messages", ox=30, pause=2200, exact=True)
    pg.mouse.wheel(0, -260); beat(pg, 2200)
    hover_text(pg, "Status", ox=30, pause=2200, exact=True)
    beat(pg, 2400)
    R.finish(ctx, pg, sid)

    # 11. Close — overview glide of My Jobs  (VO 29s)
    ctx, pg, sid = R.seg("close")
    goto(pg, "/app"); beat(pg, 2600)
    for lbl in ["Total Jobs", "Taking Bids", "In Execution", "Completed"]:
        hover_text(pg, lbl, ox=30, pause=2100, exact=False)
    slow_scroll(pg, 160, steps=3, pause=2000)
    slow_scroll(pg, -160, steps=3, pause=2000)
    beat(pg, 3000)
    R.finish(ctx, pg, sid)

    R.save()


ROLES = {"field": record_field, "client": record_client, "supplier": record_supplier}

if __name__ == "__main__":
    role = sys.argv[1] if len(sys.argv) > 1 else "field"
    if role not in ROLES:
        print("Unknown role:", role, "available:", list(ROLES)); sys.exit(1)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ROLES[role](browser)
        browser.close()
    print("DONE", role)
