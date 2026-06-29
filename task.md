# Nguzo Dashboard Touch-Up — progress

## DONE & VERIFIED
- schema.ts: profile(logoKey,kamActivityStatus,lastSeenAt) + supportTickets/chatMessages/chatParticipants + contracts(payout chain fields) + partOrders(qty,receiver*,efd,invoice,receipt). DB PUSHED ✓
- main.tsx: global 2-min refetchInterval ✓
- API: /me heartbeat, /me/activity, /me/password, /me/profile, /profile ✓
- ui.tsx: contractRef() + ActivityDot() + PaymentTracker(4-step) ✓
- shell.tsx: AvatarMenu dropdown + KAM activity status ✓
- ProfilePage component + /app/profile route on client/kam/parts (supplier/field/admin keep own) ✓

### Phase 0 — help desk (COMPLETE ✓ verified end-to-end)
- supportTickets/chatMessages tables ✓
- 5 help-desk endpoints (GET/POST /support/ticket, POST message, GET thread, GET queue) ✓
- HelpDesk widget (client/supplier/parts) + HelpDeskInbox (kam/admin nav+route) ✓
- demo client now assigned managerId=kam ✓ (fixed routing)
- VERIFIED curl: client opens → routes to KAM → KAM replies → client reads thread ✓

### Phase 0.5 — payment activation chain (COMPLETE ✓ verified end-to-end)
- supplier mark-complete ✓ / client sign-off (gate: requires TaskComplete) ✓
- KAM payout-slip (gate: requires AwaitingKamSubmission) ✓
- admin approve-release (gate: requires PendingAdminApproval) + runSettlement ✓
- payout-gateway.ts lib + PayoutGatewayModal (admin) + PaymentTracker x4 ✓
- VERIFIED curl: all 3 gate-locks 400, full chain → settlement 10% correct (3.52M→client+5%/supplier-5%) ✓

## NEXT — Phases 1-6 (per-dashboard, plan-dashboards.md) — AUDIT what's actually left
ADMIN -> KAM -> FIELD -> SUPPLIER -> PARTS -> CLIENT
(many items may already be built — audit each against plan before building)

## FINAL
- re-seed, tsc, vite build, Playwright 7 roles 0 errors, curl gate checks, push GitHub

## ENV
- dev: tmux `srv` Vite :4200, cwd packages/web
- logins: {client,supplier,supplier2,field,kam,parts,admin}@nguzo.africa / nguzo2026
- playwright chrome: /usr/bin/google-chrome-stable
- github: https://github.com/hkinyaki/AFRIGENLink-NGUZO-2167.git

## Phase 3 — FIELD ✅ DONE & VERIFIED (June 29 2026)
- 2 mandatory machine photos (front+back) block report submit; saved to inspected asset.photos.
  - schema: inspections.frontPhotoKey/backPhotoKey added + pushed.
  - api: POST /inspections validates+persists photos, copies to assets.photos.
  - field.tsx InspectJob: 2 photo pickers (capture=environment), gate on both keys.
- NEW backend: /field/my-accounts (assigned suppliers, masked contact), /field/part-deliveries (deliverTo=FieldAgent), POST /field/part-deliveries/:id/received.
- NEW FieldAPI helpers + field.tsx sections: My Accounts, Spare Deliveries, Job History (read-only docs/photos/report status only — no contract/money).
- VERIFIED: tsc EXIT 0, re-seed, 5 field routes render 0 console errors, 3 new endpoints 200.
- NEXT: Phase 4 SUPPLIER (supplier.tsx).

## Phase 4 — SUPPLIER ✅ DONE & VERIFIED (June 29 2026)
- Fleet READ-ONLY: removed Add asset btn + AddAsset modal. Cards show inspection photos (front/back), full status badge, expandable job history, double-entry red-flag ring (asset on >1 live job).
- /assets?mine=1 enriched per asset: jobs[], liveJobCount, onLiveJob, doubleEntry.
- Breakdown: added Quantity + Receiver name + Destination fields; spare search "by name or code"; reportBreakdown passes qty/receiver/destination; backend persists + scales totalCost by qty; orders list shows qty/deliverTo/receiver/destination.
- Ledger already had locked escrow + parts credit + payouts (kept).
- VERIFIED: tsc EXIT 0, re-seed, 6 supplier routes 0 console errors, fleet AddAsset absent, breakdown new fields render, asset enrichment present.
- NEXT: Phase 5 PARTS (parts.tsx).

## Phase 5 — PARTS ✅ DONE & VERIFIED (June 29 2026)
- Inventory: added dedicated "Item code" (SKU) column (mono amber).
- DispatchCard + History: show qty + receiver + destination.
- Dispatch now decrements stock by order.qty (was always 1).
- NEW "Invoices & Receipts" section (/app/billing): "Generate EFD receipt" → backend POST /part-orders/:id/generate-receipt (parts_supplier/admin, gated Dispatched/Delivered, idempotent, simulated EFD number) → "Download receipt" generates simulated EFD fiscal PDF (generateEfdReceiptPDF).
- NEW "Ledger" section (/app/ledger): orders sorted by date, fulfilled value + dispatch-queue KPIs, EFD column.
- VERIFIED: tsc EXIT 0, re-seed, 6 parts routes 0 console errors, generate-receipt → 200 + EFD number.
- NEXT: Phase 6 CLIENT (client.tsx).

## Phase 7 — REVERSALS (cancel/refund/shorten) — IN PROGRESS (June 29 2026)
- [x] engine.computeReversal + supplierPenaltyPct + daysToStart + stageRank — 22/22 unit tests pass
- [x] schema: reversals table + contracts.cancelStatus/actualDaysWorked — PUSHED
- [x] API: request/review/approve + 2 reads — tsc EXIT 0
- [x] reversal PDF (generateReversalPDF) — tsc EXIT 0
- [x] TenderAPI helpers (reversalRequest/Review/Approve/getReversal/listReversals)
- [x] UI: client (ReversalPanel modal), kam (Reversals review queue), admin (Reversals + gateway modal + PDF), supplier (ledger penalty/transfer table). Ledger/timeline entries flow via reversal.* activityEvents.
- [x] seed demo reversals: Shorten (Requested → KAM queue) + Cancel (KamReviewed → admin queue)
- [x] verify: tsc EXIT 0, vite build clean (30 routes), curl e2e PASS (request→KAM forward→admin approve, balanced, refund 787500 + retained 650000), smoke 0 console errors (client/kam/admin/supplier incl /app/reversals), visual KAM+admin queues render seeded rows
- [ ] push github
