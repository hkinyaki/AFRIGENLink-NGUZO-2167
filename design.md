# AFRIGEN — Design System

Industrial B2B operating infrastructure. High-trust, dense, engineered. Not a marketing site — a working console.

## Aesthetic principles
- **Engineered, not decorated.** Every pixel reads as instrumentation. Think mission-control / commodities terminal, not SaaS landing page.
- **Density is a feature.** Enterprise + admin views are data-dense tables and ledgers. Field/supplier views are lean and thumb-friendly.
- **Amber is a signal, never decor.** Safety amber appears ONLY on friction: breakdowns, delays, compliance flags, escrow warnings, overrides. If it's not a problem or an action-on-a-problem, it's not amber.

## Color tokens (CSS variables)
- `--navy-900: #0B1220`  app background (deepest)
- `--navy-800: #111A2E`  panel background
- `--navy-700: #18233D`  raised panel / header
- `--navy-600: #22304F`  borders on navy
- `--slate-500: #4A5A73` muted text / inactive
- `--slate-300: #8A98AE` secondary text
- `--slate-100: #D7DEEA` primary text on dark
- `--canvas: #EEF1F6`    slate-gray canvas (light data surfaces / tables in client+admin)
- `--canvas-line: #D4DAE4` table gridlines on canvas
- `--ink: #0E1626`        text on canvas
- `--amber-500: #F5A623`  FRICTION accent (breakdown/delay/flag)
- `--amber-600: #E08E12`  amber hover/pressed
- `--amber-bg: #2A2110`   amber tint on dark for alert rows
- `--green-500: #2FA86A`  success / verified / funds disbursed (used sparingly)
- `--red-500: #E0524A`    hard error / rejected / discrepancy

Status → color map:
- Available / Verified / Signed-Off / Disbursed → green
- Pending / In-Transit / Active → slate
- Breakdown / Delay / DiscrepancyFlagged / Override → **amber**
- Rejected / Insufficient escrow → red

## Typography
- **Display / headings / numerals:** `Space Grotesk` (engineered, technical). Use for KPIs, table headers, money figures (tabular-nums).
- **Body / UI:** `Inter Tight` for compact UI; fall back to system. Body comfortable but tight line-height (1.45).
- Money always `font-variant-numeric: tabular-nums`, TZS prefix, grouped thousands.
- Avoid: rounded friendly fonts, Roboto, default Inter at loose tracking.

## Layout
- **Shell:** fixed left rail (icon + label nav, role-scoped) on navy-800; top bar with role badge, company name, escrow/ledger summary, sign-out.
- **Client + Admin:** wide canvas (`--canvas`) data tables, sticky headers, right-side detail drawers.
- **Supplier:** responsive cards + the big amber "Report Breakdown" action zone; Escrow Vault as a locked-balance panel.
- **Field Force:** single-column mobile-first; large tap targets, camera/photo capture blocks, minimal chrome.
- Grid: 12-col desktop, generous gutter; collapses to single column under 768px.
- Corners: 6px (crisp, not pill). Borders 1px hairline. Subtle elevation only on drawers/modals.

## Components
- **StatusPill** — color-mapped per status map above.
- **MoneyCell** — TZS, tabular-nums, right-aligned in tables.
- **LedgerRow** — escrow lock state, fee split, payout; amber if breakdown credit deducted.
- **ComplianceChecklist** — items swap by Domestic/CrossBorder; each row has permit type + verify/flag state.
- **ToggleRoute** — segmented Domestic | Cross-Border control; switching re-renders checklist.
- **BreakdownPanel** — supplier amber zone: part search dropdown → escrow validation result → dispatch manifest.
- **InvoiceSheet** — printable HTML (window.print → PDF-style), itemized splits.
- **KPIStat** — Space Grotesk numeral + label, for dashboards.

## Motion
- Minimal, functional. One staggered reveal on dashboard load. Status changes pulse once (amber pulse on new breakdown). No decorative animation.

## PWA
- Installable manifest, navy theme color, standalone display, AFRIGEN mark. Field/supplier usable as zero-download mobile web.
