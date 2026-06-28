# Nguzo Onboarding/KYC + Assignment-Scoped + Security — progress

Plan: /home/user/plan-appsec-fix-and-signup.md (approved). App: /home/user/afrigen. Dev: tmux `srv` Vite :4200.
Demo logins: client@/supplier@/supplier2@/field@/kam@/parts@/admin@nguzo.africa pass nguzo2026.

## STEP 1 — Schema  [DONE]
- profile: +mustChangePassword, onboardingComplete, onboardingStep, fieldStation, nationalId, nationalIdDocKey, faceImageKey, address, authoriser{Name,Title,Phone}, company{RegNo,Tin,Sector}. verificationStatus default -> PendingOnboarding.
- inspections: +assignedFieldId, +supplierId.
- NEW table kybDocuments(id, profileId, kind, fileKey, label, createdAt).
- NEXT: db:push

## STEP 2 — API (index.ts, auth.ts, s3.ts, middleware, lib/security.ts)  [TODO]
- registration lockdown (self-signup client|supplier|parts_supplier; /me/role 403 else); add parts_supplier
- KAM auto-assign round-robin on supplier/parts register
- onboarding: GET/POST /onboarding, POST /onboarding/asset, POST /me/password, POST /me/profile
- verification-queue ALL roles + 2 tabs; /admin/verify two-tier; /admin/profile/:id
- assignment: /admin/assign-kam/:id, /admin/field/:id/station, /kam/clients, /field/inspections (masked), /field/inspection/:id/reveal-contact, /profile/:id scoped
- verified-gate 403 on /tenders POST, /bids, /confirm-award
- map old verificationStatus literals (Approved/Pending) -> new enum
- SECURITY: C1 CORS allowlist + trustedOrigins; C2 IDOR doc verify; C3 presign MIME/size/owner-key + attachment GET; C4 forged doc tender check; H2 ratelimit; H3 zod; H4 idempotency; H5 headers; H6 remove ADMIN_EMAILS req-time promo (keep /me bootstrap); H1 MFA scaffold

## STEP 3 — Web UI  [TODO]
- auth.tsx: +parts_supplier role, fix stale 7%->10%, post-login router (mustChangePassword->password->onboarding)
- NEW onboarding.tsx wizard (role-aware)
- admin.tsx: My KYC + Profile nav/routes; queue 2 tabs; create-staff Field/KAM/Admin + creds modal; field station selector; KAM reassign
- kam.tsx: My Clients scoped + profile drawer docs
- field.tsx: station-gated + masked contact + Reveal
- supplier.tsx/parts.tsx: "Your Nguzo Manager" card
- ui.tsx: Verified badge, shared Profile/Change-Password panel
- shell.tsx: Verified badge all roles
- tenders.ts: OnboardingAPI, ProfileAPI pw/profile, StaffAPI creds, AdminAPI queue/assignKam/setStation, FieldAPI inspections/reveal, KamAPI clients
- use-me.ts: Me type new fields

## STEP 4 — demo-seed.ts  [TODO]
- users at varied states; fieldStation; managerId links; map Approved->Verified

## STEP 5 — VERIFY  [TODO]
- tsc + vite build clean; 7 dashboards 0 console errors; curl red-team checks
