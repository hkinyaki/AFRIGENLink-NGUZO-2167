# Nguzo Procurement Workflow — BUILT ✅

Quantity-demand multi-supplier tender + strict staged-approval gate. All verified.

## Shipped
- **Schema**: tenders, bids, documents, messages, activityEvents, notifications; contracts extended (tenderId, unitsAwarded, agreedPricePerUnitTzs, agreementSignedUrl, contractStage); inspections link to tender/contract. Pushed to Turso.
- **Lib**: s3 (presignPut/Get), award (computeAward auto-fill + volume-weighted flat fair), stages (strict gate map + actors), events (logEvent/logNotification/notifyMany).
- **API** (src/api/index.ts): uploads/presign, documents CRUD+verify, tenders CRUD, bids, confirm-award (spawns 1 contract/supplier + compliance + notifs), 8 staged advance endpoints (each role+order guarded via advanceStage), per-tender messages, timeline, admin tenders/ground-force/notifications. Legacy contract/cargo/parts endpoints untouched.
- **Web constants**: asset-types.ts (demand types + carrier/machine dropdowns), stage-view.ts (tracker).
- **UI components**: FileUpload (presign→PUT→save), StageTracker, Timeline, MessageThread. jsPDF agreement + invoice in lib/tenders.ts (replaced window.print popup).
- **Dashboards rewired**:
  - client: My Jobs + Post a Job (demand) + Job detail (bids→confirm award, permit+TT upload w/ escrow preview, timeline, messaging, docs).
  - supplier: Jobs (Open Tenders bid qty+price / My Awards) + Job detail (agreement download+upload, fleet docs, tracker, messaging). Fleet/Vault/Breakdown kept. Old CargoBids removed.
  - field: Inspections (jobs at MachineDocsUploaded → review docs, inspect, verify→advance). Yard Audits + Border Log kept.
  - admin: Jobs (pipeline + verify permits / confirm TT / approve execute) + Ground Force + Notifications. Overview/Verify/Team/Ledger kept.
- **Seed**: 2nd supplier added (supplier2@nguzo.africa). 3 tenders: open w/ 2 bids (auto-fill demo), awarded mid-gate at PermitsUploaded (admin action), executing multi-supplier w/ escrow held. Timeline+messages+notifs seeded.

## Verified
- Build clean (SKIP_BUILD_PRERENDER=1 vite build). tsc --noEmit clean.
- All 4 dashboards load, 0 console errors (Playwright).
- Full gate via curl: award flat 512,500 + 2 contracts; 8 transitions in strict order all 200; wrong-actor blocked; 12 timeline events.

## QA WALK (June 19 2026) — PASSED ✅
- qa_walk.py drives one fresh job (3 tippers, Dar→Geita) through ALL 10 gate stages, 2 suppliers, mixing real UI clicks + authed API calls (presign uploads). 31/31 functional checks pass.
- Award auto-filled 3/3 units, flat fair TZS 513,333/unit, 2 contracts spawned. All 8 transitions strict-order 200. Wrong-actor execute → 403. Out-of-order advance → 400. Timeline = 12 events (verified in DB; the script's "1 event" was an API read-timing artifact, not a bug).
- 14 clean branded screenshots in shots/qa/ (00-auth, 10-16 client, 11/14 supplier, 20-21 field, 30-33 admin) — reuse for PDF + videos.
- Playwright: pip install --break-system-packages playwright; executable_path=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome, args=["--no-sandbox"]. Login: button[type=submit], pass nguzo2026.

## NEXT: tutorials (plan approved /home/user/nguzo-tutorials-plan.md)
1. QA — DONE.
2. PDF walkthrough — DONE. 11-page A4 branded guide at tutorials/Nguzo-Platform-Guide.pdf (cover→overview 10-stage table→Client→Supplier→Field→Admin→Investor read). Built via tutorials/build_guide.py (HTML→Chrome PDF, Sora/Manrope/IBM Plex Mono, navy #141B2E/amber #D99A2B, real QA screenshots embedded base64). Logo is 1024² square emblem — show as square mark not horizontal band.
3. 5 narrated video clips (per role + overview pitch). Overview first for approval. Voice = george (default). Reuse capture.py/build_assets.py/build_video.py. → tutorials/clips/

## Deferred (per decisions)
- E-sign (agreement download→sign→re-upload for now). Real email/SMS (notifications Logged). Real courier API. Auto-permit fetch. Single-asset quick-contract folded into demand flow.

## Env
- Dev: tmux `srv` Vite :4200, cwd packages/web. Restart: tmux kill-server; tmux new-session -d -s srv -c /home/user/afrigen/packages/web; tmux send-keys -t srv 'exec ./node_modules/.bin/vite --port 4200 --host 2>&1 | tee /tmp/srv.log' Enter
- Logins: client@/supplier@/supplier2@/field@/admin@nguzo.africa / nguzo2026
- Re-seed: cd packages/web && bun --env-file=../../.env src/api/demo-seed.ts
