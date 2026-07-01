# AFRIGEN Link — 4 changes (executing, plan approved)

## Change 1 — back-office escrow (no client TT upload)
- [ ] s3.ts: add uploadBuffer(key, buf, contentType)
- [ ] NEW proofs.ts: generatePaymentProofPDF + issuePaymentProofs(tenderId) + generateInvoiceDoc + generateExtensionContractDoc
- [ ] events.ts: logNotification/notifyMany accept attachments
- [ ] index.ts tt-uploaded (client, no doc) + tt-confirmed (remove TTProof gate, call issuePaymentProofs)
- [ ] client.tsx L383 payment block: remove FileUpload, add "I have cleared the payment"
- [ ] admin.tsx: "Confirm escrow secured"
- [ ] kam.tsx: "Confirm escrow secured" (remove ttDoc verify gate)
- [ ] stages.ts STAGE_LABEL.TTUploaded + stage-view.ts
- [ ] demo-seed.ts drop empty TTProof rows

## Change 2 — supplier docs viewable (Invoice server-side)
- [ ] index.ts confirm-award: generate + persist Invoice PDF doc row
- [ ] demo-seed real fileKeys for invoice/agreement/operator docs

## Change 3 — extension rework
- [ ] schema.ts extensions: supplierResponse/declineReason/client+supplierSignedName+At/contractDocId + status machine
- [ ] drizzle-kit push
- [ ] index.ts /extend init status; NEW /respond /sign /activate; rework /pay back-office
- [ ] tenders.ts extendRespond/extendSign/extendActivate + rework payExtension
- [ ] client.tsx ExtensionRow state machine
- [ ] supplier.tsx Extensions section
- [ ] kam.tsx Extensions queue
- [ ] scheduler.ts only PendingPayment past dueDate lapses
- [ ] seed demo extensions

## Change 4 — operator docs at machine-docs
- [ ] supplier.tsx add OperatorId + OperatorLicence uploads, gate all 3
- [ ] field.tsx include both kinds
- [ ] schema.ts comment
- [ ] seed rows

## Verify
- [ ] tsc clean; vite build clean; seed; playwright 7 roles 0 errors; commit+push
