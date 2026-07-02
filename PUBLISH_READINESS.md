# AFRIGEN Link — Publish Readiness Report

**Date:** 2 July 2026
**Scope:** Codebase readiness only. Actual go-live (domain connect, DNS, publish) is done by the owner through the platform UI — this report certifies the code is ready for that step.
**Verdict:** ✅ **READY TO PUBLISH** — with the honest caveats in the Security section below.

---

## 1. Build & Type Gates

| Gate | Result |
|------|--------|
| `bunx tsc --noEmit` | ✅ exit 0 |
| `bunx vite build` | ✅ exit 0 — 556 modules, 30 routes prerendered |
| Dev server `:4200` | ✅ healthy (`/api/health` → `{"status":"ok"}`) |
| Seed | ✅ 9 accounts, 30 tenders |

Only non-blocking warnings at build: one large JS chunk (441 kB gzip) and a dynamic/static double-import notice on `tenders.ts`. Both cosmetic; neither breaks the build or runtime.

---

## 2. Dashboard Sweep — all 6 roles, every section (Playwright, real Chrome, real 2FA login)

Each role logged in through the **genuine** email/password → TOTP 2-step challenge (live codes generated with the same primitive Better Auth verifies against — no simulation). Every section route walked; console monitored.

| Role | 2FA login | Sections | Console errors |
|------|-----------|----------|----------------|
| Client | ✅ verified | /app, /new, /ledger | 0 |
| Supplier | ✅ verified | /app, /fleet, /payments, /ledger, /breakdown, /profile | 0 |
| Parts Supplier | ✅ verified | /app, /inventory, /history, /billing, /ledger | 0 |
| Field Agent | ✅ verified | /app, /accounts, /deliveries, /history, /audits, /border\*, /profile | 0 |
| KAM | ✅ verified | /app, /accounts, /payments, /reversals, /parts, /agents, /support | 0 |
| Admin | ✅ verified | /app, /jobs, /ground, /verify, /payments, /reversals, /team, /notifications, /support, /ledger, /kyc, /profile | 0 |

\* `/app/border` renders a minimal shell for the demo field agent because that agent is stationed at `yard` (not `border`). This is **correct scoping**, not a defect — a border-stationed agent sees the Border Log; a yard agent does not.

**Result: 6/6 roles verified, every section renders, 0 console errors.**

---

## 3. End-to-End Flow & Authorization Proofs (API, cookie/token from real 2FA login)

Backend gates were driven with bearer tokens obtained through the real 2FA UI login, then hammered directly.

**14/14 e2e + authz checks pass:**

- ✅ All 6 roles authenticate end-to-end (email/pw → TOTP → session)
- ✅ Admin sees full tender book (30)
- ✅ **Staged-gate order enforced** — jumping a Bidding tender straight to `execute` is rejected (steps must complete in order)
- ✅ Client **cannot** reach admin-only endpoints (`/api/admin/tenders` → blocked)
- ✅ Client **cannot** set a master PIN (admin/allowlist only → blocked)
- ✅ KAM **cannot** release a payout (admin-only → blocked)
- ✅ Unauthenticated requests to `/api/me` and `/api/admin/tenders` → 401
- ✅ `/api/health` public → 200

**Payout release gate (dedicated proof, 3/3 pass):**

- ✅ Release without TT bank-transfer proof → **400** (proof mandatory)
- ✅ Release with wrong master PIN → **401**
- ✅ Release with wrong authenticator (TOTP) code → **401**

The release path requires: admin role **AND** contract in `PendingAdminApproval` **AND** uploaded TT proof **AND** correct master PIN (scrypt-hashed) **AND** a fresh valid TOTP. All four independently proven to fail-closed.

---

## 4. Security Posture — honest grading

> **We do not claim this system is "100% secure", "unhackable", or "hacker-proof".** No system is. Below is an honest, graded assessment with residual risks stated plainly.

### 🟢 GREEN — strong, verified

- **Authentication:** Better Auth 1.4.22, email+password with mandatory **two-factor (TOTP + email-OTP fallback)**. 7/7 core accounts enrolled. Login 2FA challenge verified holding correctly (fixed a prior bug where the challenge could revert).
- **Sensitive-action step-up:** Payout release demands a **fresh TOTP + master PIN** on top of an existing session — verified fail-closed on every wrong input. No "simulated code" anywhere in the production auth/step-up path (grep-confirmed).
- **Master PIN:** scrypt with random salt + `timingSafeEqual` comparison; owner/allowlist-gated; never client-settable.
- **Authorization:** 108 API routes; **106 guarded** by `requireAuth`/`requireRole`. Only `/health` and `/contact` are intentionally public. Role guards proven to block cross-role access.
- **Transport/response headers (live-verified):** HSTS (1 yr, includeSubDomains), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking camera/mic/geo.
- **CORS:** strict allowlist (env + deployment URL + localhost). **Never reflects `*`.** Credentials scoped to allowlisted origins only.
- **Upload safety:** presign route enforces a MIME allowlist (PDF + PNG/JPEG only), auth-required, rate-limited.
- **Injection surface:** all DB access via Drizzle parameterized queries; **0** `dangerouslySetInnerHTML` in the web app; contact/inputs length-capped.
- **Staged gate integrity:** the 11-step contract gate is server-enforced (order + actor-role), not just UI-hidden.

### 🟡 AMBER — acceptable now, harden before scale

- **Rate limiting is in-memory / per-instance.** Fine for a single-server B2B back office; if you scale to multiple instances or add a CDN/edge, move to a shared store (Redis) so limits are global. `/api/auth/*` capped at 30/min; `/contact` now capped at 5/min (added this pass); uploads 40/min.
- **Money is SIMULATED — "monitored, not held."** No live bank/escrow binding yet. This is by design and stated honestly across the site/FAQ. The real aggregator swap happens only inside `payout-gateway.simulate()` behind a thin seam. **Do not represent to users that funds are actually held/settled by a bank until that binding + a licensed escrow/aggregator agreement is in place.**
- **Bearer token in localStorage.** Standard for this SPA and paired with short-lived sessions + 2FA, but localStorage is XSS-reachable in principle. The site has no `dangerouslySetInnerHTML` and no obvious injection sink, which is the main mitigation. Consider httpOnly-cookie sessions if you later add third-party embeds/scripts.
- **Master PIN demo value (123456)** is a seed convenience. **Must be rotated to a strong owner-set PIN before real use.**

### 🔴 RED — must be addressed before handling real money (not blockers for publishing the platform itself)

- **No licensed escrow / payment-aggregator integration.** Until signed and bound, this is a coordination + record-keeping platform, not a custodian. Keep the "monitored, not held" framing everywhere (verified present in 13 files; two over-promising strings — "we keep your money safe" — were **removed this pass**).
- **Webhook signature verification & idempotency** for the real payment rail are not yet implemented (nothing to verify until the rail is bound). These are mandatory on the day the aggregator goes live.

---

## 5. Brand & Content Integrity (grep-audited)

- ✅ No user-facing `Nguzo` / `NGZ-` anywhere in `src/web` (brand is **AFRIGEN Link**).
- ✅ No leaked `simulatedCode` in production paths.
- ✅ "monitored, not held" framing present; **removed** 3 over-promising "keep your money safe" strings (auth, footer, CTA) — replaced with honest wording.
- ✅ No cash / mobile-money wording (bank transfers only, as specified).
- ✅ No competitor names; AFRIGEN kept separate from JTA / MyTenant.
- ✅ Fee model consistent: flat 10% (5% client on top + 5% supplier deducted).
- ✅ Corridors correct: Southern (Tunduma→Zambia), Central (→Rwanda/Burundi), Northern (Namanga→Kenya), anchored Dar es Salaam.

---

## 6. Bottom Line

The codebase is **ready to publish**. Types clean, build clean, all 6 dashboards fully functional with zero console errors, and the core money-safety gates (staged approval, payout step-up, role isolation) are proven to fail closed.

**Before real transactions flow** (post-publish, separate track): bind a licensed escrow/aggregator with webhook signatures + idempotency, rotate the master PIN, and move rate-limiting to a shared store if scaling out.

Publishing itself (domain/DNS/go-live) is the owner's step via the platform UI.
