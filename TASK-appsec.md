# Nguzo Onboarding/KYC + Assignment-Scoped + AppSec Build

## STATUS ENUM (new, canonical)
profile.verificationStatus: PendingOnboarding | Submitted | SiteVisitScheduled | Verified | Rejected
- migrate old "Approved" -> "Verified", "Pending" -> "PendingOnboarding"

## STEPS
- [x] schema: add profile.username
- [ ] db:push
- [ ] lib/security.ts (headers, rate-limit, idempotency, MIME allowlist consts)
- [ ] auth.ts trustedOrigins allowlist (C1)
- [ ] index.ts CORS allowlist (C1)
- [ ] s3.ts presignPut MIME+size; presignGet attachment (C3)
- [ ] status enum migration across /me, /me/role, /admin/verify, /inspections, /admin/staff/*
- [ ] /onboarding GET+POST (role-aware KYC/KYB)
- [ ] /me/password, /me/profile (admin+staff profile + change pwd)
- [ ] /admin/verification-queue ALL roles, remote vs site-visit tabs
- [ ] staff create with username + temp creds + mustChangePassword
- [ ] KAM round-robin auto-assign on supplier/parts registration
- [ ] /admin/assign-kam/:profileId, /admin/field/:profileId/station
- [ ] /kam/clients (scoped), /field/inspections (masked), /field/inspection/:id/reveal-contact
- [ ] /profile/:id, /admin/profile/:id
- [ ] verified-gate on /tenders POST, /bids, /confirm-award (403 if !Verified)
- [ ] C2 IDOR /documents/:id/verify; C4 canAccessTender on /documents POST
- [ ] yard audit requires supplier managerId (KAM-first) 409/403
- [ ] UI: onboarding wizard, auth router+username login+10% fix
- [ ] UI: admin queue/create-staff/credentials receipt/KYC/Profile/station/KAM reassign
- [ ] UI: field station+reveal, kam clients, supplier/parts manager card, Verified badge
- [ ] lib/tenders.ts API clients
- [ ] use-me.ts Me type
- [ ] demo-seed update
- [ ] verify tsc + build + playwright + curl
- [ ] git init + push to AFRIGENLink-NGUZO-2167

## USERNAME login
better-auth uses email. Staff login: admin sets username -> store profile.username + synth email `<username>@staff.nguzo.local`. auth.tsx login allows username -> map to synth email if no @.
