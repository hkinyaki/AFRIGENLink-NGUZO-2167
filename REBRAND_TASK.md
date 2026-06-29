# AFRIGEN Link Rebrand — COMPLETE

## DONE (all verified)
- App components: brand.tsx, site-footer.tsx, site-nav.tsx, help-desk.tsx, profile-page.tsx, ui.tsx
- API: events.ts (from/badge/subject), engine.ts labels, index.ts (synthEmail @staff.afrigen.local, temp pwd AfriLink-, notif strings)
- PDF libs: tenders.ts (headers/body/filenames + generateNguzoBankPDF->generateBankPDF), payout-gateway.ts
- Dashboards: client/supplier/admin/kam/parts/onboarding/auth display strings
- Marketing site/*: all pages, emails hello@afrigen.link, fee 7%->10% aligned to locked model
- index.html title+og meta, manifest.json
- demo-seed.ts: *@afrigen.link, password afrigen2026, company names; .env ADMIN_EMAILS + RESEND_FROM
- og-image.jpg regenerated (AFRIGEN Link branded)
- Booklets: source + 6 PDFs re-rendered as 0X_AFRIGEN-Link_*.pdf
- VO scripts vo_lines.py (for deferred tutorial re-render)
- demo-credentials/credentials.html
- KEPT internal (correct): nguzo_fee_* columns, nguzo JSONB key, nguzoFee*/nguzoRevenue vars, ["client","supplier","nguzo"] arrays, engine.ts code comments

## VERIFIED
- tsc 0, vite build exit 0
- smoke.py all 7 roles 0 console errors (afrigen2026 / *@afrigen.link)
- wordmark renders "AFRIGEN Link" (nav, hero, og, booklet cover)
- re-seeded DB with new creds

## NOT DONE (deferred / flagged to Hugo)
- Tutorial VIDEO re-render (6 incl new KAM) — Hugo triggers later (VO scripts ready)
- brand/marks/*.html — historical logo-exploration, not live
- electron-builder.json5 — still placeholder defaults, part of desktop plan
- Marketing fee copy now says "flat 10% (5% client + 5% supplier)" — Hugo should confirm public wording

## NEXT
- Commit + push to GitHub
- THEN: QA sweep + auto-email contracts plan
