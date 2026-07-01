# AFRIGEN Link — Security + Staff Invites + Manual Settlement

## A. Login security (2FA/TOTP) — DONE ✓
- [x] auth-schema: add `twoFactorEnabled` to user + `twoFactor` table
- [x] schema: profile.contactEmail, profile.masterPinHash (owner only)
- [x] auth.ts: twoFactor plugin (totp + otp via Resend), keep bearer+expo
- [x] web/lib/auth.ts: twoFactorClient()
- [x] db:push
- [x] auth.tsx: handle twoFactorRedirect → challenge screen (totp or email code)
- [x] onboarding.tsx: force TOTP enrollment after password change (backup codes shown once)
- [x] approve-release: require fresh TOTP + masterPinHash (owner only)
- [x] doc-otp: drop simulatedCode, verify real TOTP
- [x] rate-limit verify/issue

## B. Staff email invites
- [x] staff/create: accept+store contactEmail, send Resend invite (username+temp pwd)
- [x] reset-password: email new temp pwd to contactEmail
- [x] notifications/OTP route to contactEmail for staff
- [x] admin.tsx: Email field in add-staff form
- [x] events.ts: invite template + recipient resolution (prefer contactEmail for staff)

## C. Manual settlement (bank-only, proof + confirm)
- [x] generateBankPDF placeholder AFRIGEN bank details
- [x] tt-uploaded: require TTProof doc uploaded
- [x] tt-confirmed: require TTProof verified before advance
- [x] payout-slip → KAM submit (no upload)
- [x] approve-release: admin uploads PayoutProof + TOTP+PIN before settle
- [x] schema: contracts.payoutProofKey (or reuse payoutSlipKey)
- [x] "monitored, not held" labels; interim banner
- [x] UI: client/kam/admin/supplier

## Gate
- tsc clean; vite build exit 0; dev :4200; Playwright 7 dashboards 0 errors
- email tests to smartassistantjts@gmail.com
- grep: no simulatedCode prod path; "monitored, not held"; no cash/mobile-money
- commit + push

## Key decisions
- Two-factor plugin's OTP provider = email-code fallback (no separate emailOTP plugin needed; less surface)
- Bearer/localStorage token flow: 2FA challenge cookie is same-origin httpOnly → flows fine; verifyTotp issues set-auth-token → captureToken grabs it
- Master PIN = owner/super-admin profile ONLY

## Master PIN UI (resolved blocker) — Jul 1
- [x] Added MasterPinForm card to admin MyProfile (Security section) → calls /me/master-pin
- [x] ProfileAPI.setMasterPin added to tenders.ts
- [x] FIXED Bun.password → runtime-agnostic scrypt lib/pin.ts (dev server is Node, Bun undefined)
- [x] Seeded demo admin master PIN = 123456 (scrypt format)
- [x] e2e payout release VERIFIED: TOTP+PIN gate → payout_status=Approved, FundsDisbursed, proof stored, payout.released logged, supplier payout computed
- [x] pin lib unit: correct=true, wrong=false, bad-format=false
- [x] tsc clean, vite build exit 0
- [ ] commit + push
