# Build — Timeframe + Billing + Extension + 10% Fee

## 1. Schema (database/schema.ts)
- [x] tenders: needByDate, transitDays, startDate, jobDays, endDate, estTransferDays
- [x] bids: availabilityNote, transferFeeTzs, dailyRateTzs
- [x] contracts: startDate, endDate, dailyRateTzs, transferFeeTzs, contractValueTzs, clientFeeTzs, reminderSentAt, extensionStatus, removalRight
- [x] NEW extensions table
- [x] db:push

## 2. Engine (lib/engine.ts)
- [x] CLIENT_FEE_RATE=0.05 + SUPPLIER_FEE_RATE=0.05 (retire PLATFORM_FEE_RATE)
- [x] computeAmountToFund(value)
- [x] runSettlement(contractValue, emergencyCredit) rewrite, 5%/5% line items

## 3. API (api/index.ts)
- [x] POST /tenders: persist timing + compute endDate (addDays helper)
- [x] POST /tenders/:id/bids: availabilityNote + transferFee + dailyRate, derive pricePerUnit
- [x] confirm-award: copy dates/rates, set contractValue/clientFee/platformFee/escrow
- [x] TT/escrow funding = amountToFund
- [x] sign-off: runSettlement(contractValue,...)
- [x] NEW POST /contracts/:id/extend
- [x] NEW POST /contracts/:id/extend/:extId/pay
- [x] NEW GET /contracts/:id/extensions

## 4. Email + Scheduler
- [x] events.ts: real Resend send (graceful w/o key)
- [x] NEW lib/scheduler.ts: 10-day reminder + overdue removalRight
- [x] wire startScheduler() in server.ts
- [x] install resend, ask_secrets for key

## 5. Web lib (web/lib/tenders.ts)
- [x] types + TenderAPI.extend/payExtension/getExtensions
- [x] generateAgreementPDF: hire period, fees, clauses

## 6. UI
- [x] client.tsx: post form timing, fee breakdown, extend flow
- [x] supplier.tsx: open-tender timing, split bid, availability, net payout
- [x] admin.tsx: timing, extension status, revenue

## 7. Seed + Verify
- [x] demo-seed: dates, split bids, near-end contract
- [x] tsc, build, dashboards, fee math check
