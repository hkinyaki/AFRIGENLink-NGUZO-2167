"""Narration-driven recorder for Nguzo role training (cursor locked to the VO).

Unlike record_flow_roles.py (fixed beat() choreography), this plays each segment
from its per-line timeline (tutorials/vo_lines/<role>/<seg>.json). For every line
the cursor performs ONE action and HOLDS on it for exactly that line's spoken
duration, with a small lead-in so the cursor ARRIVES just before the word is said.
Footage length per line == VO length per line, so the builder needs ~zero stretch
and the cursor lands on each element AS the narrator names it.

Per-segment fresh recording context (avoids Playwright VFR/idle drift).
Output: tutorials/seg_roles/<role>/<segment>/*.webm + _segs.json (same layout the
builder already consumes).

Usage:
  python3 record_synced.py supplier
"""
import os, json, sys
from playwright.sync_api import sync_playwright

# reuse all the low-level helpers + state setup from the existing recorder
import record_flow_roles as RF
from record_flow_roles import (
    BASE, VP, OUT, ACCOUNTS, AGREE, MACH, PERMIT, TT,
    Recorder, goto, beat, move_to, center, ensure_cursor,
    setup_supplier_tenders,
)

ROOT = "/home/user/afrigen/tutorials"
LINE = f"{ROOT}/vo_lines"
FILEMAP = {"AGREE": AGREE, "MACH": MACH, "PERMIT": PERMIT, "TT": TT}

LEAD_MS = 480          # cursor arrives this long before the word lands
SETTLE_MS = 60         # min dwell floor for any action


def ripple(pg, x, y):
    try: pg.evaluate("([x,y])=>window.__nzRipple(x,y)", [x, y])
    except Exception: pass


def text_box(pg, txt, exact=False):
    try:
        loc = pg.get_by_text(txt, exact=exact).first
        if loc.count() == 0:
            print(f"   ⚠ MISS hover target not found: {txt!r}")
            return None
        loc.scroll_into_view_if_needed(); pg.wait_for_timeout(120)
        return loc.bounding_box()
    except Exception:
        print(f"   ⚠ MISS hover target errored: {txt!r}")
        return None


def btn_box(pg, name):
    try:
        loc = pg.get_by_role("button", name=name).first
        if loc.count() == 0:
            print(f"   ⚠ MISS button not found: {name!r}")
            return None
        loc.scroll_into_view_if_needed(); pg.wait_for_timeout(120)
        return loc.bounding_box()
    except Exception:
        print(f"   ⚠ MISS button errored: {name!r}")
        return None


def wait_anchor(pg, txt, timeout=8000):
    """Block until a stable anchor text renders, so async job-detail data
    is present before the timeline starts (kills the ~46s head drift)."""
    try:
        pg.get_by_text(txt).first.wait_for(state="visible", timeout=timeout)
        pg.wait_for_timeout(250)
    except Exception:
        print(f"   ⚠ anchor not visible in {timeout}ms: {txt!r}")


def do_action(pg, action, arg, hold_ms):
    """Perform `action` and consume ~hold_ms wall-time (lead-in cursor + dwell).
    Always blocks for ~hold_ms so footage length == this line's VO length."""
    hold = max(hold_ms, SETTLE_MS)
    lead = min(LEAD_MS, hold * 0.4)
    rest = hold - lead

    def glide_to(bx, ox=40):
        if not bx:
            pg.wait_for_timeout(int(hold)); return
        mx, my = bx["x"] + ox, bx["y"] + bx["height"] / 2
        move_to(pg, mx, my, settle=int(lead))
        ripple(pg, mx, my)
        pg.wait_for_timeout(int(rest))

    try:
        if action == "hold":
            pg.wait_for_timeout(int(hold))

        elif action == "hover":
            glide_to(text_box(pg, arg), ox=40)

        elif action == "nav":
            glide_to(text_box(pg, arg, exact=True), ox=20)

        elif action == "hoverbtn":
            bx = btn_box(pg, arg)
            if bx:
                cx, cy = bx["x"]+bx["width"]/2, bx["y"]+bx["height"]/2
                move_to(pg, cx, cy, settle=int(lead)); ripple(pg, cx, cy)
                pg.wait_for_timeout(int(rest))
            else:
                pg.wait_for_timeout(int(hold))

        elif action == "scroll":
            # smooth multi-step wheel over the whole line duration
            steps = 4
            per = max(int(hold / steps), 120)
            dy = int(arg / steps)
            for _ in range(steps):
                pg.mouse.wheel(0, dy); pg.wait_for_timeout(per)

        elif action == "type":
            sel, val, nth = arg
            try:
                loc, x, y = center(pg, sel, nth)
                move_to(pg, x, y, settle=int(lead)); ripple(pg, x, y)
                loc.click(); loc.fill("")
                # spread typing across the remaining time
                delay = max(40, min(220, int(rest / max(len(val), 1))))
                loc.type(val, delay=delay)
                pg.wait_for_timeout(max(int(rest - delay * len(val)), 150))
            except Exception as e:
                print("   (type)", e); pg.wait_for_timeout(int(rest))

        elif action == "typeph":
            ph, val = arg
            try:
                loc = pg.locator(
                    f'input[placeholder*="{ph}"], textarea[placeholder*="{ph}"]').first
                loc.scroll_into_view_if_needed(); bx = loc.bounding_box()
                if bx:
                    x, y = bx["x"]+bx["width"]/2, bx["y"]+bx["height"]/2
                    move_to(pg, x, y, settle=int(lead)); ripple(pg, x, y)
                loc.click(); loc.fill("")
                delay = max(45, min(220, int(rest / max(len(val), 1))))
                loc.type(val, delay=delay)
                pg.wait_for_timeout(max(int(rest - delay * len(val)), 150))
            except Exception as e:
                print("   (typeph)", e); pg.wait_for_timeout(int(rest))

        elif action == "check":
            # arg = visible label text near the checkbox; glide to it, tick it
            try:
                loc = pg.get_by_text(arg, exact=False).first
                loc.scroll_into_view_if_needed(); bx = loc.bounding_box()
                if bx:
                    x, y = bx["x"]+20, bx["y"]+bx["height"]/2
                    move_to(pg, x, y, settle=int(lead)); ripple(pg, x, y)
                pg.wait_for_timeout(int(rest * 0.4))
                cb = pg.locator('input[type="checkbox"]').first
                cb.check()
                pg.wait_for_timeout(int(rest * 0.6))
            except Exception as e:
                print("   (check)", e); pg.wait_for_timeout(int(rest))

        elif action == "typenum":
            # arg = (value,) — fill the first number input (e.g. units needed)
            val = arg[0] if isinstance(arg, (list, tuple)) else str(arg)
            try:
                loc = pg.locator('input[type="number"]').first
                loc.scroll_into_view_if_needed(); bx = loc.bounding_box()
                if bx:
                    x, y = bx["x"]+bx["width"]/2, bx["y"]+bx["height"]/2
                    move_to(pg, x, y, settle=int(lead)); ripple(pg, x, y)
                pg.wait_for_timeout(int(rest * 0.35))
                loc.click(); loc.fill(""); loc.type(str(val), delay=160)
                pg.wait_for_timeout(int(rest * 0.55))
            except Exception as e:
                print("   (typenum)", e); pg.wait_for_timeout(int(rest))

        elif action == "selectopt":
            label, nth = arg
            try:
                loc, x, y = center(pg, "select", nth)
                move_to(pg, x, y, settle=int(lead)); ripple(pg, x, y)
                pg.wait_for_timeout(int(rest * 0.4))
                if label:
                    loc.select_option(label=label)
                pg.wait_for_timeout(int(rest * 0.6))
            except Exception as e:
                print("   (select)", e); pg.wait_for_timeout(int(rest))

        elif action == "selectidx":
            # arg = (select_nth, option_index) — pick the Nth <select>'s
            # option at the given index (1 = first real option after the
            # placeholder). Cursor glides to the control then the value is set.
            sel_nth, opt_idx = arg
            try:
                loc, x, y = center(pg, "select", sel_nth)
                move_to(pg, x, y, settle=int(lead)); ripple(pg, x, y)
                pg.wait_for_timeout(int(rest * 0.45))
                loc.select_option(index=opt_idx)
                pg.wait_for_timeout(int(rest * 0.55))
            except Exception as e:
                print("   (selectidx)", e); pg.wait_for_timeout(int(rest))

        elif action == "click":
            bx = btn_box(pg, arg)
            if bx:
                cx, cy = bx["x"]+bx["width"]/2, bx["y"]+bx["height"]/2
                move_to(pg, cx, cy, settle=int(lead)); ripple(pg, cx, cy)
                pg.wait_for_timeout(160)
                try: pg.get_by_role("button", name=arg).first.click()
                except Exception as e: print("   (click)", e)
                pg.wait_for_timeout(int(rest))
            else:
                pg.wait_for_timeout(int(hold))

        elif action == "upload":
            try:
                pg.set_input_files('input[type="file"]', FILEMAP[arg])
                pg.wait_for_timeout(int(hold))
            except Exception as e:
                print("   (upload)", e); pg.wait_for_timeout(int(hold))

        else:
            pg.wait_for_timeout(int(hold))
    except Exception as e:
        print("   (action err)", action, e)
        pg.wait_for_timeout(int(hold))


# ----------------------------------------------------------------------
# Per-segment START state: where the page must be before the timeline runs.
# Returns a function(pg) -> None (already on the right URL, settled).
# ----------------------------------------------------------------------
def supplier_starts(bid_tid, sign_tid, docs_tid):
    return {
        "intro":        lambda pg: goto(pg, "/app"),
        "open-tenders": lambda pg: goto(pg, "/app"),
        "place-bid":    lambda pg: goto(pg, f"/app/job/{bid_tid}"),
        "my-awards":    lambda pg: (goto(pg, f"/app/job/{sign_tid}")),
        "agreement":    lambda pg: goto(pg, f"/app/job/{sign_tid}"),
        "fleet-docs":   lambda pg: goto(pg, f"/app/job/{docs_tid}"),
        "fleet":        lambda pg: goto(pg, "/app/fleet"),
        "add-asset":    lambda pg: goto(pg, "/app/fleet"),
        "vault":        lambda pg: goto(pg, "/app/vault"),
        "breakdown":    lambda pg: goto(pg, "/app/breakdown"),
        "close":        lambda pg: goto(pg, "/app"),
    }


def field_starts(inspect_tid):
    return {
        "intro":          lambda pg: goto(pg, "/app"),
        "awaiting":       lambda pg: goto(pg, "/app"),
        "open":           lambda pg: goto(pg, f"/app/inspect/{inspect_tid}"),
        "review-docs":    lambda pg: goto(pg, f"/app/inspect/{inspect_tid}"),
        "verify-vin":     lambda pg: goto(pg, f"/app/inspect/{inspect_tid}"),
        "verify-notes":   lambda pg: goto(pg, f"/app/inspect/{inspect_tid}"),
        "verify-advance": lambda pg: goto(pg, f"/app/inspect/{inspect_tid}"),
        "audits-form":    lambda pg: goto(pg, "/app/audits"),
        "audits-history": lambda pg: goto(pg, "/app/audits"),
        "border-form":    lambda pg: goto(pg, "/app/border"),
        "border-history": lambda pg: goto(pg, "/app/border"),
    }


def _new_with_machinery(pg):
    """Open Post-a-Job and pre-select Machinery so the detail fields render."""
    goto(pg, "/app/new")
    try:
        pg.get_by_role("button", name="Machinery rental").first.click()
        pg.wait_for_timeout(700)
    except Exception as e:
        print("   (pre-machinery)", e)


def _new_filled(pg):
    """Open Post-a-Job, select Machinery and pre-fill the detail fields so the
    submit step shows a complete, ready-to-post form."""
    _new_with_machinery(pg)
    try:
        pg.locator("select").first.select_option(index=1); pg.wait_for_timeout(300)
        pg.locator('input[type="number"]').first.fill("2")
        pg.locator('input[placeholder*="earthworks"]').first.fill(
            "Bulk earthworks and trenching for a warehouse foundation")
        pg.locator('input[placeholder="e.g. Geita"]').first.fill("Dodoma")
        pg.wait_for_timeout(300)
    except Exception as e:
        print("   (pre-fill)", e)


def client_starts(bid_tid, fv_tid, pm_tid, pv_tid):
    return {
        "intro":        lambda pg: goto(pg, "/app"),
        "read-stage":   lambda pg: goto(pg, "/app"),
        "post-type":    lambda pg: goto(pg, "/app/new"),
        "post-details": lambda pg: _new_with_machinery(pg),
        "post-submit":  lambda pg: _new_filled(pg),
        "bids-award":   lambda pg: (goto(pg, f"/app/job/{bid_tid}"), wait_anchor(pg, "Bids (")),
        "awarded":      lambda pg: (goto(pg, f"/app/job/{fv_tid}"), wait_anchor(pg, "Awarded Suppliers")),
        "permits":      lambda pg: (goto(pg, f"/app/job/{pm_tid}"), wait_anchor(pg, "Your step — Upload permits")),
        "payment":      lambda pg: (goto(pg, f"/app/job/{pv_tid}"), wait_anchor(pg, "Your step — Payment proof")),
        "track":        lambda pg: goto(pg, "/app"),
        "close":        lambda pg: goto(pg, "/app"),
    }


def setup_client_tenders(browser):
    """Stage three client tenders for the live action steps:
       - bid_tid: Bidding stage with two bids placed (bids-award segment)
       - fv_tid:  FieldVerified (awarded + permits segments)
       - pv_tid:  PermitsVerified (payment segment)"""
    print(">> setup: client demo tenders")
    bid_tid = RF.post_machinery_tender(
        browser, "Site clearance — Mwanza", "Excavator",
        "Site clearance and bulk earthworks for a new yard", "Mwanza", 3)
    RF.supplier_bid(browser, bid_tid, 2, 905000, who="supplier")
    RF.supplier_bid(browser, bid_tid, 1, 940000, who="supplier2")
    # 'awarded' segment: CLEAN FieldVerified (no permit doc) so it shows agreements +
    # inspection state without the permits submit button bleeding in.
    fv_tid = RF.build_client_tender(
        browser, "Foundation earthworks — Dodoma site", "Excavator",
        "Bulk earthworks and trenching for warehouse foundation", "Dodoma", 2, 920000, "FieldVerified")
    # 'permits' segment: separate FieldVerified tender with a permit doc pre-uploaded
    # (NOT submitted) so the "Submit permits for verification" button renders on camera.
    pm_tid = RF.build_client_tender(
        browser, "Drainage culvert works — Tabora", "Excavator",
        "Culvert excavation and drainage works on a rural feeder road", "Tabora", 2, 915000, "FieldVerified")
    # 'payment' segment: PermitsVerified tender with a TT doc pre-uploaded (NOT submitted)
    # so the "Submit payment proof" button renders on camera.
    pv_tid = RF.build_client_tender(
        browser, "Road base grading — Morogoro", "Motor Grader",
        "Grading and compaction of 4km access road base", "Morogoro", 2, 880000, "PermitsVerified")
    _client_upload_no_submit(browser, pm_tid, RF.PERMIT)   # permits seg: button appears
    _client_upload_no_submit(browser, pv_tid, RF.TT)       # payment seg: button appears
    print("   bid:", bid_tid, "fv:", fv_tid, "pm:", pm_tid, "pv:", pv_tid)
    return bid_tid, fv_tid, pm_tid, pv_tid


def _client_upload_no_submit(browser, tid, filepath):
    """Upload a document as the client without clicking Submit (stage unchanged)."""
    ctx, cc = RF.api_login_page(browser, RF.ACCOUNTS["client"])
    try:
        cc.goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); cc.wait_for_timeout(1200)
        cc.set_input_files('input[type="file"]', filepath); cc.wait_for_timeout(1800)
        print(f"   pre-uploaded doc on {tid} (no submit)")
    except Exception as e:
        print("   (_client_upload_no_submit)", e)
    ctx.close()


# ----------------------------------------------------------------------
# ADMIN setup: three tenders parked on the three admin gates so each
# action card renders live on camera, plus the rich seed (Executing +
# disbursed contracts) gives Overview/Ledger/Ground Force populated data.
# ----------------------------------------------------------------------
def _client_submit_permits(browser, tid):
    """Client uploads permits AND submits -> PermitsUploaded (admin gate 1)."""
    ctx, cc = RF.api_login_page(browser, RF.ACCOUNTS["client"])
    try:
        cc.goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); cc.wait_for_timeout(1400)
        cc.set_input_files('input[type="file"]', RF.PERMIT); cc.wait_for_timeout(1600)
        cc.get_by_role("button", name="Submit permits for verification").first.click(); cc.wait_for_timeout(2000)
        print(f"   permits submitted on {tid} -> PermitsUploaded")
    except Exception as e:
        print("   (_client_submit_permits)", e)
    ctx.close()


def _client_submit_tt(browser, tid):
    """Client uploads TT proof AND submits -> TTUploaded (admin gate 2)."""
    ctx, cc = RF.api_login_page(browser, RF.ACCOUNTS["client"])
    try:
        cc.goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); cc.wait_for_timeout(1400)
        cc.set_input_files('input[type="file"]', RF.TT); cc.wait_for_timeout(1600)
        cc.get_by_role("button", name="Submit payment proof").first.click(); cc.wait_for_timeout(2000)
        print(f"   TT submitted on {tid} -> TTUploaded")
    except Exception as e:
        print("   (_client_submit_tt)", e)
    ctx.close()


def _admin_advance(browser, tid, step):
    """Admin advances a tender one gate via authenticated API."""
    ctx, ap = RF.api_login_page(browser, RF.ACCOUNTS["admin"])
    try:
        ap.goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); ap.wait_for_timeout(1200)
        RF.try_admin_advance(ap, tid, step); ap.wait_for_timeout(1500)
    except Exception as e:
        print("   (_admin_advance)", e)
    ctx.close()


def setup_admin_tenders(browser):
    """Park three tenders on the three admin gates:
       perm_tid -> PermitsUploaded   (gate 1: verify permits)
       tt_tid   -> TTUploaded        (gate 2: confirm payment)
       exec_tid -> TTConfirmed       (gate 3: approve execution)"""
    print(">> setup: admin demo tenders (three gates)")
    # gate 1: drive to FieldVerified, then client submits permits -> PermitsUploaded
    perm_tid = RF.build_client_tender(
        browser, "Excavators ×2 — Quarry access road, Geita", "Excavator",
        "Bulk earthworks and access-road cut for a new quarry", "Geita", 2, 1_300_000, "FieldVerified")
    _client_submit_permits(browser, perm_tid)

    # gate 2: drive to PermitsVerified, client submits TT -> TTUploaded
    tt_tid = RF.build_client_tender(
        browser, "Wheel Loaders ×3 — Plant works, Mwanza", "Wheel Loader",
        "Material handling and stockpile works for a plant site", "Mwanza", 3, 1_050_000, "PermitsVerified")
    _client_submit_tt(browser, tt_tid)

    # gate 3: drive to PermitsVerified, client submits TT, admin confirms -> TTConfirmed
    exec_tid = RF.build_client_tender(
        browser, "Graders ×2 — Highway base, Morogoro", "Motor Grader",
        "Grading and compaction of 6km highway base layer", "Morogoro", 2, 980_000, "PermitsVerified")
    _client_submit_tt(browser, exec_tid)
    _admin_advance(browser, exec_tid, "tt-confirmed")
    print("   perm:", perm_tid, "tt:", tt_tid, "exec:", exec_tid)
    return perm_tid, tt_tid, exec_tid


def admin_starts(perm_tid, tt_tid, exec_tid):
    return {
        "intro":           lambda pg: goto(pg, "/app"),
        "overview":        lambda pg: goto(pg, "/app"),
        "jobs":            lambda pg: goto(pg, "/app/jobs"),
        "verify-permits":  lambda pg: (goto(pg, f"/app/job/{perm_tid}"), wait_anchor(pg, "Action required")),
        "confirm-payment": lambda pg: (goto(pg, f"/app/job/{tt_tid}"), wait_anchor(pg, "Action required")),
        "approve-execute": lambda pg: (goto(pg, f"/app/job/{exec_tid}"), wait_anchor(pg, "Action required")),
        "ground-force":    lambda pg: goto(pg, "/app/ground"),
        "verification":    lambda pg: goto(pg, "/app/verify"),
        "team":            lambda pg: goto(pg, "/app/team"),
        "notifications":   lambda pg: goto(pg, "/app/notifications"),
        "ledger":          lambda pg: goto(pg, "/app/ledger"),
        "close":           lambda pg: goto(pg, "/app"),
    }


def run_role(role):
    timeline_dir = f"{LINE}/{role}"
    seg_files = [f for f in sorted(os.listdir(timeline_dir)) if f.endswith(".json")]
    only = os.environ.get("ONLY_SEG")
    if only:
        seg_files = [f for f in seg_files if json.load(open(f"{timeline_dir}/{f}"))["id"] in only.split(",")]
        print("ONLY_SEG =", only, "->", seg_files)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=RF.CHROME, args=["--no-sandbox"])

        if role == "supplier":
            bid_tid, sign_tid, docs_tid = setup_supplier_tenders(browser)
            starts = supplier_starts(bid_tid, sign_tid, docs_tid)
        elif role == "field":
            inspect_tid = RF.setup_inspect_ready_tender(browser)
            starts = field_starts(inspect_tid)
        elif role == "client":
            bid_tid, fv_tid, pm_tid, pv_tid = setup_client_tenders(browser)
            starts = client_starts(bid_tid, fv_tid, pm_tid, pv_tid)
        elif role == "admin":
            perm_tid, tt_tid, exec_tid = setup_admin_tenders(browser)
            starts = admin_starts(perm_tid, tt_tid, exec_tid)
        else:
            raise SystemExit(f"role {role} not wired yet")

        R = Recorder(browser, role)
        meta = {}   # sid -> {path, head, body}  (head = seconds before line 0)
        TAIL = 0.35
        for sf in seg_files:
            tl = json.load(open(f"{timeline_dir}/{sf}"))
            sid = tl["id"]
            print(f">> SEG {sid}  ({len(tl['lines'])} lines, {tl['seg_dur']}s)")
            ctx, pg, _ = R.seg(sid)
            starts[sid](pg)
            beat(pg, 700)                      # tiny settle before line 0
            # the timeline body blocks for exactly the sum of line durations
            body = 0.0
            for ln in tl["lines"]:
                hold_ms = int(ln["dur"] * 1000)
                do_action(pg, ln["action"], ln["arg"], hold_ms)
                body += hold_ms / 1000.0
            beat(pg, int(TAIL * 1000))
            R.finish(ctx, pg, sid)
            path = R.segs[sid]
            raw = float(__import__("subprocess").check_output(
                ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",path]).strip())
            # head = everything before line 0 actually began = raw - body - tail
            head = max(raw - body - TAIL, 0.0)
            meta[sid] = {"path": path, "head": round(head, 2),
                         "body": round(body, 2), "raw": round(raw, 2)}
            print(f"   head={head:.1f}s body={body:.1f}s raw={raw:.1f}s")
        # write enriched _segs.json (path + precise head per segment).
        # When ONLY_SEG is set, MERGE into the existing file so we don't
        # clobber the other segments already recorded.
        out = f"{OUT}/{role}/_segs.json"
        if only and os.path.exists(out):
            prev = json.load(open(out))
            prev.setdefault("segs", {}); prev.setdefault("heads", {})
            for k, v in meta.items():
                prev["segs"][k] = v["path"]; prev["heads"][k] = v["head"]
            prev["role"] = role
            json.dump(prev, open(out, "w"), indent=2)
        else:
            json.dump({"role": role,
                       "segs": {k: v["path"] for k, v in meta.items()},
                       "heads": {k: v["head"] for k, v in meta.items()}},
                      open(out, "w"), indent=2)
        print("SAVED", out)
        browser.close()
    print("DONE", role)


if __name__ == "__main__":
    role = sys.argv[1] if len(sys.argv) > 1 else "supplier"
    run_role(role)
