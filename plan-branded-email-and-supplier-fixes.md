# Plan — Branded Email + Supplier Bug Fixes + Dashboard Audit

Scope: AFRIGEN Link. Three tracks. Money stays simulated ("monitored, not held"). No brand mixing with JTA.

---

## Track A — Branded transactional email (primary goal)

**Current state:** `events.ts` `emailHtml()` renders a plain navy bar with the text "AFRIGEN LINK" (no logo icon). Sends work (verified — plain test landed in inbox). Domain already switched to `@afrigenlink.com`, key present, `.com` verified in Resend.

**Do:**
1. **Prepare inline logo.** `public/logo-icon.png` is 440×620, 240KB — too heavy inline. Downscale to ~96px tall PNG (transparent), then base64-embed as a `data:` URI in the header. (Inline base64 avoids external-image blocking in Gmail/Outlook.)
2. **Rebuild `emailHtml()`** to brand-guardian spec:
   - Navy `#141B2E` header band (dominant), amber `#D99A2B` accent-only (thin rule / button, never reversed).
   - Logo icon + "AFRIGEN Link" wordmark (AFRIGEN bold, Link amber) top-left.
   - White content card on warm-white `#F7F6F3` bg.
   - IBM-Plex-Mono-styled block for IDs / TZS amounts (use `font-family:'Courier New',monospace` fallback for email clients; comma-separated TZS).
   - Optional amber CTA button param (e.g. "Open dashboard").
   - Footer: **"AFRIGEN Link — a brand of AFRIGEN Holdings Ltd"** + tagline "Cargo & Machinery Coordination — Secured." + the three corridors line where relevant.
   - Voice "We". No SaaS fluff, no generic greeting.
3. **Keep `logNotification()` wiring intact** — just richer template. Add optional `ctaLabel`/`ctaUrl` passthrough (backward compatible).
4. **Send two live samples to `smartassistantjts@gmail.com`** (user picked options 1 & 3):
   - (1) Realistic **notification**: "Your job AGL-CT-004 is ready for sign-off" with dashboard CTA.
   - (3) **Contract/invoice-style** email: contract summary — parties, units, agreed rate, contract value, 10% breakdown (5% client / 5% supplier), escrow "monitored, not held".
5. **Verify:** render locally to HTML first (screenshot via chrome) → confirm branding correct → send → confirm inbox + correct render.

**Completion gate:** both branded emails land in inbox and render with logo + navy/amber correctly.

---

## Track B — Supplier dashboard bug fixes

### Bug 1 — Spare-part search returns nothing when typing a name
**Root cause (confirmed):** `GET /api/parts` filters **only** by `compatibleModel` (`?model=`). The UI search box passes the query as `model`, but users type part **names/SKUs** ("turbocharger", "TRB-320D"). Those never match `compatibleModel`, so the list empties → "No matching in-stock spares." (Empty query returns all 6, which is why it "sometimes works".)

**Fix:** broaden the server filter to match across `part_name`, `sku`, AND `compatible_model` (case-insensitive OR). Rename the query param to `q` (keep `model` as alias for safety) and update `PartsAPI.search`. Data is healthy (6 Active parts, stock>0) — pure code fix.

### Bug 2 — Fleet asset profile won't open
**Root cause (confirmed):** There is **no asset-profile view** — the only control is a "View jobs" text toggle (`setOpenId`) that expands the job list inline. There's no full profile modal (photos, engine/VIN, operator, status, full job history), so clicking feels like "nothing opens."

**Fix:** add a proper **Asset Profile modal** opened from each fleet card: 2 inspection photos (front/back), asset type/manufacturer/model, operational status, engine serial, VIN/chassis, yard, day rate, double-entry flag, and full previous-jobs list with operator. Keep it read-only (fleet is inspection-populated, non-editable — per locked rule).

**Verify:** Playwright login as `supplier@afrigen.link` → type "turbo"/"320D"/SKU → dropdown filters correctly; open an asset → profile modal renders with photos + jobs. 0 console errors.

---

## Track C — Remaining unbuilt-feature audit (deliver as findings, not build)

Walk all 7 dashboards against the June-29 touch-up decision list and flag what's still missing vs shipped (e.g. help-desk floating chat, avatar dropdown, clickable KPI redirects, KAM activity status, auto-refresh coverage, parts EFD receipt flow, ledger ref# column, etc.). Output = a prioritized punch-list section appended here for your approval before any further build.

---

## Track D — Commit
After A + B verified: `tsc` + `vite build` clean → commit the email-domain switch **and** these fixes together → push to `hkinyaki/AFRIGENLink-NGUZO-2167` main.

---

## Order
1. Track A (email template + 2 sends + verify) ← primary
2. Track B (both supplier fixes + verify)
3. Track C (audit findings for approval)
4. Track D (commit + push)

No live bank calls. No JTA cross-reference. "We" voice throughout.
