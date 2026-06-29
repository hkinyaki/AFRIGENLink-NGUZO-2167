# Nguzo Onboarding/KYC + Assignment-Scoped + AppSec — DONE

## Verified (2026-06-28)
- [x] schema (username, KYC/KYB, fieldStation, mustChangePassword, status enum)
- [x] AppSec: CORS allowlist, security headers, rate limit, MIME+size+attachment, IDOR/canAccessTender, self-promote 403
- [x] Onboarding: forced pwd change, role-aware wizard, 2-tier verify queue (remote clients / site-visit suppliers)
- [x] Username staff login (synth email), credentials receipt, userCodes NGZ-*
- [x] KAM scoped clients, field masked-contact reveal, station assignment, KAM-first audit
- [x] Verified-gate on tenders/bids/award
- [x] tsc clean, vite build exit 0
- [x] Playwright: all 7 dashboards 0 console errors (admin 9 sections, kam 5, etc.)
- [x] curl end-to-end gate tests all pass
- [x] git commit
- [ ] git push -> AFRIGENLink-NGUZO-2167 (awaiting token)
