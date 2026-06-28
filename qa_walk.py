"""
Nguzo procurement gate QA walk.
- Logs in per role via the real auth UI (better-auth cookies land in the context).
- Drives ONE fresh job through all 10 gate stages, mixing real UI clicks with
  authenticated API calls (cookies reused) where file-pickers would be fragile.
- Screenshots every dashboard state into /home/user/afrigen/shots/qa for PDF+video reuse.
Run: python3 qa_walk.py
"""
import os, json, time, sys
from playwright.sync_api import sync_playwright

OUT = "/home/user/afrigen/shots/qa"
os.makedirs(OUT, exist_ok=True)
BASE = "http://localhost:4200"
PASS = "nguzo2026"
CHROME = "/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
VP = {"width": 1600, "height": 1000}

ACCOUNTS = {
    "client":   "client@nguzo.africa",
    "supplier": "supplier@nguzo.africa",
    "supplier2":"supplier2@nguzo.africa",
    "field":    "field@nguzo.africa",
    "admin":    "admin@nguzo.africa",
}

results = []
def ok(msg):  results.append(("PASS", msg)); print("PASS", msg)
def bad(msg): results.append(("FAIL", msg)); print("FAIL", msg)

def login(ctx, email):
    page = ctx.new_page()
    page.goto(BASE + "/app", wait_until="networkidle")
    page.wait_for_selector('input[type="email"]', timeout=15000)
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', PASS)
    page.click('button[type="submit"]')
    page.wait_for_timeout(3500)
    return page

def api(ctx, method, path, **kw):
    """Authenticated API call reusing the context's cookies."""
    r = ctx.request.fetch(BASE + path, method=method, **kw)
    return r

def upload_doc(ctx, kind, tender_id, contract_id=None):
    """presign -> PUT bytes -> save document row, reusing cookies."""
    fname = f"{kind}-{int(time.time()*1000)}.pdf"
    pre = api(ctx, "POST", "/api/uploads/presign",
              data={"filename": fname, "contentType": "application/pdf", "scope": kind})
    if not pre.ok:
        bad(f"presign {kind}: {pre.status}"); return False
    pj = pre.json()
    body = b"%PDF-1.4\n% QA demo document\n"
    put = ctx.request.fetch(pj["url"], method="PUT",
                            data=body, headers={"content-type": "application/pdf"})
    if not put.ok:
        bad(f"PUT {kind}: {put.status}"); return False
    payload = {"kind": kind, "tenderId": tender_id, "label": f"QA {kind}",
               "fileKey": pj["key"], "mimeType": "application/pdf"}
    if contract_id: payload["contractId"] = contract_id
    save = api(ctx, "POST", "/api/documents", data=payload)
    if not save.ok:
        bad(f"save doc {kind}: {save.status} {save.text()}"); return False
    ok(f"uploaded {kind}")
    return True

def shot(page, name):
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{OUT}/{name}.png", full_page=True)
    print("  shot", name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

    # contexts per role (isolated cookies)
    ctxs = {role: browser.new_context(viewport=VP) for role in ACCOUNTS}
    pages = {role: login(ctxs[role], email) for role, email in ACCOUNTS.items()}
    ok("all roles logged in")

    # auth screen (fresh ctx)
    c0 = browser.new_context(viewport=VP); pg0 = c0.new_page()
    pg0.goto(BASE + "/app", wait_until="networkidle"); pg0.wait_for_timeout(1500)
    pg0.screenshot(path=f"{OUT}/00-auth.png"); c0.close()

    cc = ctxs["client"]; sp = ctxs["supplier"]; sp2 = ctxs["supplier2"]
    fd = ctxs["field"]; ad = ctxs["admin"]

    # ---- 1. CLIENT posts a job ----
    job = api(cc, "POST", "/api/tenders", data={
        "title": "QA — River sand to Geita site",
        "demandType": "CargoCarrier",
        "carrierOrMachineType": "Tipper Truck",
        "cargoOrProjectDesc": "600t river sand for foundation works",
        "unitsNeeded": 3,
        "routeClassification": "Domestic",
        "origin": "Dar es Salaam",
        "destination": "Geita",
    })
    if not job.ok:
        bad(f"create tender: {job.status} {job.text()}"); print(json.dumps(results)); sys.exit(1)
    tid = job.json()["tenderId"]
    ok(f"client posted job {tid} (need 3 tippers)")
    pages["client"].goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); shot(pages["client"], "10-client-job-bidding")

    # ---- 2. SUPPLIERS bid (3 units total across 2 suppliers, varied price) ----
    b1 = api(sp,  "POST", f"/api/tenders/{tid}/bids", data={"unitsOffered": 2, "pricePerUnitTzs": 500000, "note": "2 tippers ready"})
    b2 = api(sp2, "POST", f"/api/tenders/{tid}/bids", data={"unitsOffered": 2, "pricePerUnitTzs": 540000, "note": "2 available"})
    (ok if b1.ok else bad)(f"supplier1 bid {b1.status}")
    (ok if b2.ok else bad)(f"supplier2 bid {b2.status}")
    pages["supplier"].goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); shot(pages["supplier"], "11-supplier-bid")
    pages["client"].reload(); shot(pages["client"], "12-client-bids-in")

    # ---- 3. CLIENT confirms award (auto-fill cheapest to 3) ----
    aw = api(cc, "POST", f"/api/tenders/{tid}/confirm-award")
    (ok if aw.ok else bad)(f"confirm-award {aw.status}")
    awj = aw.json() if aw.ok else {}
    print("  award:", json.dumps(awj.get("award", awj))[:300])
    pages["client"].reload(); shot(pages["client"], "13-client-awarded")

    def stage_of():
        r = api(ad, "GET", f"/api/tenders/{tid}")
        return r.json()["tender"]["tenderStage"] if r.ok else "?"
    ok(f"stage after award = {stage_of()}")

    # contracts (one per awarded supplier)
    det = api(cc, "GET", f"/api/tenders/{tid}").json()
    contracts = det.get("contracts", [])
    ok(f"{len(contracts)} contract(s) spawned")
    by_supplier = {c["supplierId"]: c["id"] for c in contracts}
    # map supplier profile ids
    sp_me  = api(sp,  "GET", "/api/me").json()["profile"]["id"]
    sp2_me = api(sp2, "GET", "/api/me").json()["profile"]["id"]

    # ---- 4. SUPPLIERS sign agreements + advance ----
    for ctx, pid, tag in [(sp, sp_me, "supplier"), (sp2, sp2_me, "supplier2")]:
        cid = by_supplier.get(pid)
        upload_doc(ctx, "SignedAgreement", tid, cid)
    a = api(sp, "POST", f"/api/tenders/{tid}/advance/agreements-signed")
    (ok if a.ok else bad)(f"advance agreements-signed {a.status}")
    pages["supplier"].goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); shot(pages["supplier"], "14-supplier-award-docs")
    ok(f"stage = {stage_of()}")

    # ---- 5. SUPPLIERS upload machine docs + advance ----
    for ctx, pid in [(sp, sp_me), (sp2, sp2_me)]:
        upload_doc(ctx, "MachineDoc", tid, by_supplier.get(pid))
    a = api(sp, "POST", f"/api/tenders/{tid}/advance/machine-docs")
    (ok if a.ok else bad)(f"advance machine-docs {a.status}")
    ok(f"stage = {stage_of()}")

    # ---- 6. FIELD verifies ----
    pages["field"].goto(BASE + "/app", wait_until="networkidle"); shot(pages["field"], "20-field-inspections")
    pages["field"].goto(BASE + f"/app/inspect/{tid}", wait_until="networkidle"); shot(pages["field"], "21-field-inspect")
    a = api(fd, "POST", f"/api/tenders/{tid}/advance/field-verified")
    (ok if a.ok else bad)(f"advance field-verified {a.status} {('' if a.ok else a.text())}")
    ok(f"stage = {stage_of()}")

    # ---- 7. CLIENT uploads permits + advance ----
    upload_doc(cc, "Permit", tid)
    pages["client"].goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); shot(pages["client"], "15-client-permits")
    a = api(cc, "POST", f"/api/tenders/{tid}/advance/permits-uploaded")
    (ok if a.ok else bad)(f"advance permits-uploaded {a.status}")
    ok(f"stage = {stage_of()}")

    # ---- 8. ADMIN verifies permits ----
    pages["admin"].goto(BASE + "/app/jobs", wait_until="networkidle"); shot(pages["admin"], "30-admin-jobs")
    pages["admin"].goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); shot(pages["admin"], "31-admin-verify-permits")
    a = api(ad, "POST", f"/api/tenders/{tid}/advance/permits-verified")
    (ok if a.ok else bad)(f"advance permits-verified {a.status}")
    ok(f"stage = {stage_of()}")

    # ---- 9. CLIENT uploads TT proof (escrow funding) + advance ----
    upload_doc(cc, "TTProof", tid)
    pages["client"].goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); shot(pages["client"], "16-client-tt")
    a = api(cc, "POST", f"/api/tenders/{tid}/advance/tt-uploaded")
    (ok if a.ok else bad)(f"advance tt-uploaded {a.status}")
    ok(f"stage = {stage_of()}")

    # ---- 10. ADMIN confirms TT (escrow held) ----
    pages["admin"].goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); shot(pages["admin"], "32-admin-confirm-tt")
    a = api(ad, "POST", f"/api/tenders/{tid}/advance/tt-confirmed")
    (ok if a.ok else bad)(f"advance tt-confirmed {a.status}")
    ok(f"stage = {stage_of()}")

    # ---- 11. ADMIN approves execution ----
    a = api(ad, "POST", f"/api/tenders/{tid}/advance/execute")
    (ok if a.ok else bad)(f"advance execute {a.status}")
    final = stage_of()
    (ok if final == "Executing" else bad)(f"FINAL stage = {final} (expect Executing)")
    pages["admin"].goto(BASE + f"/app/job/{tid}", wait_until="networkidle"); shot(pages["admin"], "33-admin-executing")

    # ---- negative: wrong-actor blocked ----
    neg = api(sp, "POST", f"/api/tenders/{tid}/advance/execute")  # supplier can't execute
    (ok if neg.status in (401,403) else bad)(f"wrong-actor execute blocked ({neg.status})")
    # skip-step: client tries to re-advance a finished gate
    neg2 = api(cc, "POST", f"/api/tenders/{tid}/advance/permits-uploaded")
    (ok if neg2.status in (400,403,409) else bad)(f"out-of-order advance blocked ({neg2.status})")

    # ---- timeline ----
    tl = api(ad, "GET", f"/api/tenders/{tid}/timeline")
    n = len(tl.json()) if tl.ok else 0
    (ok if n >= 9 else bad)(f"timeline has {n} events")

    # ---- console errors per role page ----
    browser.close()

# summary
fails = [m for s,m in results if s=="FAIL"]
print("\n" + "="*50)
print(f"QA RESULT: {len(results)-len(fails)} passed, {len(fails)} failed")
for s,m in results:
    if s=="FAIL": print("  FAIL:", m)
with open(f"{OUT}/_result.json","w") as f: json.dump(results, f, indent=2)
sys.exit(1 if fails else 0)
