# Nguzo Africa — Pre-Publish QA (June 20 2026)

## Scope: full pre-publish inspection — VERDICT: ✅ PUBLISH-READY

- [x] 1. Production build passes (typecheck + vite build) — exit 0, only non-blocking warnings (dynamic-import mix on tenders.ts, 1.18MB chunk)
- [x] 2. All marketing/app routes load — 12/12 return 200 (/, /how-it-works, /for-clients, /for-owners, /security, /about, /faq, /contact, /blog, /legal/terms, /legal/privacy, /app)
- [x] 3. Auth: signup roles correct (client + supplier only; admin/field internal-only), login works
- [x] 4. All 4 dashboards render perfectly (client/supplier/field/admin) — navy/amber theme, KPIs, stage trackers, ledger correct
- [x] 5. Full tender lifecycle gate 1→11 — proven by the 4 delivered training videos driving live UI through every stage; gate triple-locked in code
- [x] 6. No console errors on any of the 4 dashboards
- [x] 7. Brand-leak check — ZERO user-facing "AFRIGEN" in web source or logged-in pages
- [x] 8. SEO basics — N/A (logged-in B2B platform, not SEO-driven); index.html has proper <title> + og:image + favicon

## Findings

### PASS
- Typecheck + build clean.
- All routes 200, dashboards pixel-correct, 0 console errors.
- Gate enforcement triple-locked in `advanceStage` (src/api/index.ts:74): isNextStage→400, STAGE_ACTOR role→403, canAccessTender→403.
- No user-facing brand leaks. Demo logins `*@nguzo.africa` / `nguzo2026` current.

### COSMETIC (non-blocking)
- `dist/index.html:16` runable.js analytics tag has `data-hostname="afrigen-8f8g0db-website"` — internal platform analytics ID with the old name. **Platform-managed** (injected at build, NOT in source index.html), so cannot be hand-edited reliably — it would be regenerated on republish. Cosmetic only, never visible to users. Resolves naturally when the project is republished under its Nguzo platform name.
- Internal code COMMENTS still say AFRIGEN (intentional, kept).

## Deliverables this session
- 6 PDF booklets at `/home/user/afrigen/booklets/pdf/`:
  1. 01_Nguzo_Client_Handbook (9pg)
  2. 02_Nguzo_Supplier_Handbook (9pg)
  3. 03_Nguzo_Field_Manual (9pg)
  4. 04_Nguzo_Operations_Manual (9pg)
  5. 05_Nguzo_Company_Overview (7pg)
  6. 06_Nguzo_Platform_Guide (8pg)
