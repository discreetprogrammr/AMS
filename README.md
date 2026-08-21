# Asset Management Software — Step 1 Setup

Implements Step 1 of the build order in `AMS_Spec_v0.3.docx`: Supabase project setup, data model, and auth.

## What's here

- `schema.sql` — the full initial database schema: organizations, sites, assets, service records (preventive maintenance / radiation survey / calibration / repair / water quality test), parts tracking, compliance certificates, service tickets, an audit log, and Row Level Security policies that scope client-portal data to each organization automatically.

## Setup steps

1. **Create (or open) your Supabase project** at supabase.com — free tier is fine for the build/demo phase (Section 8 of the spec).
2. Go to the **SQL Editor** in the Supabase dashboard.
3. Paste the full contents of `schema.sql` and run it. This creates every table, enum, trigger, and RLS policy in one pass.
4. **Create your first internal-staff user**: sign up a user through Supabase Auth (dashboard → Authentication → Add user, or your app's sign-up flow), then insert a matching row into `profiles` with `role = 'internal_staff'` so you can log in and manage data:
   ```sql
   insert into profiles (id, full_name, role)
   values ('<the auth user's UUID>', 'Lourence Loque', 'internal_staff');
   ```
5. **Create a test organization and asset** to confirm everything works end to end:
   ```sql
   insert into organizations (name, sector) values ('Bureau of Customs (Demo)', 'customs') returning id;
   -- use the returned id below
   insert into assets (organization_id, asset_tag, equipment_type, brand, model, sold_by, status)
   values ('<organization id>', 'BOC-001', 'xray_screening', 'Rapiscan', 'Demo Model', 'third_party', 'operational');
   ```
6. Confirm RLS is working: query as the internal-staff user (should see everything), then create a `client_viewer` profile scoped to an organization and confirm they only see that organization's data.

## On GitHub

No dedicated GitHub connector is available in this session, so this schema and README were written as local files. Push this folder to your existing GitHub repo yourself, or connect a GitHub-capable tool in a future session so this can be committed directly.

---

# Step 2 — Asset Registry App

Implements Step 2 of the build order: a working Next.js app with sign-in, an asset list, and add/edit forms, wired to the `schema.sql` from Step 1.

## What's here

The `ams-web/` folder is a full Next.js (App Router) project:

- `middleware.ts` + `lib/supabase/` — Supabase auth session handling, redirects signed-out visitors to `/login`.
- `app/login/` — sign-in page and server actions (`login`, `logout`).
- `app/assets/page.tsx` — the asset list: asset tag, organization, equipment type, brand/model, status, next service due.
- `app/assets/new/page.tsx` and `app/assets/[id]/page.tsx` — add and edit forms, sharing one form component (`app/assets/asset-form.tsx`).
- `app/assets/actions.ts` — the server actions that actually insert/update rows in Supabase.

All TypeScript/TSX files have been checked for syntax errors (14 files, all clean). Dependencies have **not** been installed or build-tested in this session — this sandbox has no package registry access, so `npm install` needs to run in your own environment.

## Setup steps

1. **Get into the `ams-web` folder** (either locally after pulling from GitHub, or directly in this project folder).
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set your environment variables.** Copy `.env.local.example` to `.env.local` and fill in your actual Supabase project URL and anon key (Supabase dashboard → Project Settings → API):
   ```bash
   cp .env.local.example .env.local
   ```
4. **Run it locally:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` — it should redirect to `/login`. Sign in with the internal-staff user you created in Step 1 (Section 4 above). You should land on `/assets` and see the demo asset from Step 1, Section 5.
5. **Try it end to end:** add a new asset through the "+ Add Asset" form, confirm it appears in the list, then click into it and edit it.
6. **If something errors**, send me the exact error message from the terminal or browser console — since this wasn't build-tested against the real npm registry, the first `npm run dev` is the real first test.

## Deploying to Vercel

Once it runs locally without errors:

1. Push this folder to your GitHub repo (see "On GitHub" above).
2. In Vercel, import the repo, and add the same two environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) under Project Settings → Environment Variables.
3. Deploy. This gives you a shareable demo URL — useful for the BOC pitch without needing anyone else to run it locally.

---

# Step 3 — Internal Dashboard and Export

Implements Step 3 of the build order: a dashboard with the KPI row and alerts panels from Section 6 of the spec, plus a CSV export.

## What's here

- `app/dashboard/page.tsx` — the new landing page (the app now redirects `/` here instead of straight to `/assets`). Shows:
  - **KPI row:** Total Assets, % Operational, Under Maintenance, Unserviceable, Certificates Expiring in the next 30 days.
  - **Service Due panel:** any asset whose `next_service_due` falls within 30 days, overdue ones shown in red.
  - **Certificates Expiring panel:** same idea, pulled from `compliance_certificates`.
  - **Open Service Tickets** count.
- `app/api/assets/export/route.ts` — a CSV export endpoint. The "Export CSV" button on the Assets page downloads every asset with its organization, site, and compliance fields.
- Nav links added both ways: Dashboard ↔ Assets.

Since no compliance certificates or service tickets exist yet (we haven't built that UI — that's the deferred Step 2 from the spec's build order, "Service records — scheduling, parts tracking, certificate tracking"), those two panels will legitimately show empty/zero right now. That's expected, not a bug — the dashboard is querying real tables that just don't have data in them yet. The "Service Due" panel *will* show something, since `next_service_due` is a field on the asset itself and you may have set it on your test asset.

## Setup steps

1. Pull the latest code (or re-copy from this project folder if you're not on git yet for this update).
2. No new dependencies and no schema changes — nothing extra to install or run in Supabase.
3. `npm run dev`, sign in, and you should land on `/dashboard` automatically now instead of `/assets`.
4. Click "Export CSV" from the Assets page and confirm a file downloads with your test asset's data in it.
5. As before: this hasn't been build-tested against the real npm/TypeScript toolchain in this session. If `npm run dev` or a Vercel build throws an error, send me the exact message.

---

# Step 4 — Client-Facing Portal

Implements Step 4 of the build order: role-aware views so a client (like BOC) can log in and see only their own equipment, plus service requests.

## What's here

Most of the actual data scoping for this step was already done back in Step 1 — the Row Level Security policies in `schema.sql` already restrict a `client_viewer` to their own `organization_id`, which is why the RLS test in Step 1 worked. Step 4 is mostly about the UI catching up to that:

- `lib/supabase/profile.ts` — fetches the signed-in user's `profiles` row (role + organization) so pages know who's looking.
- `app/assets/[id]/page.tsx` — now branches by role: `internal_staff` sees the editable form as before; `client_viewer` sees a read-only detail view instead. Both roles now see that asset's **Compliance Certificates** and **Service Tickets** below it.
- `app/assets/tickets-actions.ts` — `createTicket` (anyone who can see the asset can raise a request — RLS already restricts a client_viewer to their own org's assets) and `resolveTicket` (staff-only in practice, enforced by RLS).
- `app/assets/page.tsx` — the "+ Add Asset" button and the direct `/assets/new` route are now hidden/blocked for anyone who isn't `internal_staff`.

Worth repeating: the UI hiding these actions is for a clean experience, not the actual security boundary — RLS in the database is what actually prevents a client_viewer from editing an asset or another org's data, regardless of what buttons are shown. That was already true and tested back in Step 1.

## Setup steps — testing both roles

1. No schema changes, no new dependencies. Pull the latest code and `npm run dev` as usual.
2. **As internal staff** (your usual login): open any asset, confirm you still see the editable form, plus the new Certificates and Service Tickets sections underneath.
3. **As the client_viewer test user** you created back in Step 1's RLS test: log out, log back in as that user. You should see:
   - Only that user's own organization's asset(s) on `/assets` and reflected in `/dashboard`'s KPIs.
   - No "+ Add Asset" button, and no edit form on the asset detail page — just a read-only view.
   - A "Raise a Service Request" form at the bottom of the asset detail page. Submit one.
4. Log back in as internal staff, open that same asset, and confirm the ticket you just submitted as the client shows up, with a "Mark Resolved" link. Click it and confirm the ticket's status updates and the dashboard's "Open Service Tickets" count drops by one.
5. As always: this is untested against a real build in this session. If something errors locally or on Vercel, send me the message.

---

# Step 5 — Inventory Cycle Workflow and Unserviceable Report

Implements Step 5 of the build order: the COA-style annual physical inventory checklist and a dedicated unserviceable-equipment report, per Section 6/7 of the spec.

## Database change — run this first

This step needed two new tables, so there's a second SQL file: **`schema_step5.sql`**, sitting next to the original `schema.sql`. It's additive — it doesn't touch anything from Step 1.

1. Open the Supabase SQL Editor.
2. Paste the full contents of `schema_step5.sql` and run it.
3. This creates `inventory_cycles` and `inventory_cycle_items`, plus RLS policies scoping them to internal staff only (this feature isn't part of the client portal — it's pure internal ops, per the spec).

## What's here

- **`/inventory`** — list of inventory cycles, staff-only (same role guard pattern as `/assets/new`).
- **`/inventory/new`** — pick a site and a label (e.g. "Annual Physical Inventory 2026"), and starting the cycle auto-creates one checklist item for every asset currently at that site.
- **`/inventory/[id]`** — the checklist itself: mark each asset verified (with optional condition notes), undo a mark if needed, see a running verified/pending count, and "Complete Cycle" when done. Completing doesn't require 100% verification — whatever's still unverified at close time *is* the discrepancy list, same as a real physical count reconciliation.
- **"Export Reconciliation"** on the cycle page — CSV of every item in that cycle: verified or not, when, by whom (implicitly, via the audit log), and condition notes.
- **"Unserviceable Report"** — a new button on the Assets page (staff-only), exporting just the assets currently flagged `unserviceable`, mirroring COA's IIRUP report.

## Setup steps

1. Run `schema_step5.sql` in Supabase first (see above) — the app will error on `/inventory` without it.
2. `npm run dev` as usual, no new dependencies.
3. As internal staff: go to Assets → Inventory → Start Cycle. Pick the site your demo asset is at, give it a label, and start it.
4. On the cycle page, mark the asset verified (try adding a condition note), confirm the count updates, then click "Export Reconciliation" and check the CSV.
5. Go back to Assets, edit your test asset's status to `unserviceable`, then click "Unserviceable Report" and confirm it shows up in that CSV.
6. As always: untested against a real build in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

---

# Step 6 — Audit Log and Role-Permission Hardening

Implements Step 6, the last step in the build order.

## Database change — run this first, and read this one carefully

**`schema_step6.sql`** fixes a real gap, not just a cosmetic addition: `audit_log` has had **no Row Level Security enabled at all** since Step 1 — every other table got `alter table ... enable row level security`, but audit_log was missed. In practice that meant any authenticated user, including a client_viewer, could read the entire change history across every organization via the Supabase API, bypassing the org-scoping the rest of the schema enforces. This migration turns RLS on for it and restricts reads to internal staff only.

It also adds a foreign key from `audit_log.changed_by` to `profiles`, so the UI can show a person's name instead of a bare UUID.

1. Open the Supabase SQL Editor.
2. Paste the full contents of `schema_step6.sql` and run it.
3. If the foreign key step fails, it means some historical `changed_by` value doesn't match a `profiles` row — let me know and we'll track down which one.

## What's here

- **`/audit-log`** — a global, staff-only log of the last 100 changes across the system: table, action, who, when, and (for updates) which fields actually changed.
- **"History" panel** on each asset's detail page (staff-only) — the same idea, scoped to that one asset.
- **`requireStaff()`** — a shared helper (`lib/supabase/profile.ts`) now used consistently across every staff-only page *and* every staff-only server action (`createAsset`, `updateAsset`, `resolveTicket`, and all four inventory actions). RLS was already the real enforcement layer for all of these — this just means a non-staff user gets a clean redirect instead of either a raw Postgres error or, in the ticket/inventory update cases, a silent no-op with no explanation at all.

## Setup steps

1. Run `schema_step6.sql` in Supabase first — `/audit-log` and the asset History panel will error without it.
2. `npm run dev`, sign in as staff, open any asset you've edited a few times, and check the History panel shows the edits with the right fields listed.
3. Visit `/audit-log` directly and confirm it shows activity across assets, tickets, and inventory cycles.
4. Log in as the client_viewer test user and confirm they don't see an "Audit Log" link anywhere, and that navigating to `/audit-log` directly redirects them away.
5. As always: untested against a real build in this session — send me the exact error if something breaks.

## Where things stand

That's all six steps from the AMS spec's build order. The app now covers: asset registry, internal dashboard, client portal, inventory cycles, and a hardened audit trail — built on GitHub + Supabase + Vercel per the tech stack in `AMS_Spec_v0.3.docx`. Government hosting requirements (DICT GovCloud accreditation, formal compliance sign-off) remain explicitly out of scope until BOC's actual procurement requirements are known, per Section 8 of the spec.

---

# Rebrand — HorizonCare360 UI restyle

No database changes, no new dependencies. Pure front-end: the app is now branded **HorizonCare360** and restyled to match a dark-theme reference design (color palette, typography, persistent sidebar/topbar layout).

## What changed

- **Rebrand**: page title/metadata, login screen, and sidebar header now say "HorizonCare360" instead of "Pacific Horizon Tek — AMS".
- **Design system**: dark near-black background, card/surface color, hairline borders, Inter font (loaded via `next/font/google`), added as Tailwind theme tokens in `tailwind.config.ts` (`base`, `surface`, `surface-2`, `hairline`).
- **`components/sidebar.tsx`** — persistent left nav, role-aware. Staff see every section from the reference design: Dashboard, Assets, and Inventory / Audit Log (real, working links), plus Fleet Map, Clients, Work Orders, Tickets, Inspections, Calendar, Reports, Alerts, and "HorizonCare360 Assist" chat as **disabled placeholders labeled "Soon"** — nothing here is faked as working. Client-viewer accounts see only Dashboard and Assets, matching what they could already access.
- **`components/topbar.tsx`** and **`components/app-shell.tsx`** — shared page header + layout wrapper. Every page now imports `AppShell` instead of hand-rolling its own header/nav bar.
- **`components/status-badge.tsx`** — one shared color-coded pill component for every status/priority value in the app (asset status, ticket status/priority, sold-by), replacing plain text labels.
- All existing pages (`dashboard`, `assets`, `assets/[id]`, `assets/new`, `inventory`, `inventory/new`, `inventory/[id]`, `audit-log`, `login`) restyled to the new dark theme. **No new features, no fabricated data** — every number on the dashboard and every table column is still pulled from the same real Supabase queries as before; nothing like the SLA gauges or engineer-workload charts in the reference screenshots was added, since we don't track that data yet.

## Setup steps

1. No SQL to run — this is a front-end-only change.
2. `npm run dev` as usual, no new dependencies.
3. Check the login page, then sign in as staff and click through Dashboard → Assets → an asset detail page → Inventory → a cycle detail page → Audit Log. Confirm the sidebar highlights the active page and the placeholder items ("Fleet Map", "Clients", etc.) show a "Soon" tag and don't navigate anywhere.
4. Log in as the client_viewer test user and confirm the sidebar only shows Dashboard and Assets — no placeholders, no staff-only links.
5. As always: only syntax-checked in this session, not run through a real build — send me the exact error if `npm run dev` or Vercel's build throws one.

## What's next

Two options once this is confirmed working: keep going on new features (the placeholder nav items — Fleet Map, Clients, Work Orders, Tickets, Inspections, Calendar, Reports, Alerts — are natural candidates, in whatever order matters most), or start the CRM build. Let me know which.

---

# Dashboard widgets — Active Tickets, Equipment Health, SLA Performance

Adding the reference-design dashboard widgets one at a time, on top of the HorizonCare360 restyle above.

## Database change

**`schema_step7.sql`** — adds two columns to `service_tickets`: `first_response_at` and `resolved_at`. No RLS changes (existing policies already cover them). Run this in the Supabase SQL Editor before testing the SLA widget.

## What's here

- **Active Support Tickets card** — real counts of open/in-progress/resolved tickets, links to a new **`/tickets`** page (global, staff-only ticket queue across all clients).
- **System & Equipment Health card** — reuses the existing operational/maintenance/unserviceable asset counts, shown as a status dot + progress bar.
- **SLA Performance card** — the one that needed new tracking. A ticket's `first_response_at` gets stamped the first time staff clicks the new **"Start Progress"** button on its detail page (or the moment it's resolved, if it was resolved without an explicit acknowledgement first). `resolved_at` gets stamped by "Mark Resolved" as before. The dashboard then computes, over tickets created in the last 30 days: average first-response time, average resolution time, and a real compliance % (resolved within 48h ÷ tickets resolved). Target is currently hardcoded at 8h response / 48h resolution — not a signed client SLA, just the working number until there's a real one to replace it with.

## Setup steps

1. Run `schema_step7.sql` in Supabase first.
2. `npm run dev`, sign in as staff, open an asset with an open ticket (or raise a new one), and click "Start Progress" — confirm it moves to "in_progress".
3. Click "Mark Resolved" and confirm the ticket disappears from the active count.
4. Go to `/dashboard` and check the SLA Performance card shows real numbers (or "—" if there's no resolved-ticket data yet in the last 30 days — that's expected on a fresh dataset, not a bug).
5. Visit `/tickets` directly and confirm it lists tickets across all assets/clients.
6. As always: only syntax-checked in this session, not run through a real build — send me the exact error if `npm run dev` or Vercel's build throws one.

## Still to come

The SLA Historical Performance chart (needs a few weeks of real resolved-ticket data to not be an empty chart) and Recent Activity & Inspections (the "Inspections" part doesn't exist as a feature yet — audit log + tickets activity could be shown now, inspections would need to be scoped separately).

---

# Quick Action Center widget

No schema changes. Adds the 4th card to the dashboard's top row (now `Active Support Tickets · System & Equipment Health · SLA Performance · Quick Action Center`).

## What's here

- **Request New Service** (primary button) — links to a new **`/tickets/new`** page: a staff-only form with an asset dropdown, description, and priority. Submitting it creates a real ticket via a new `createGlobalTicket` action (same insert logic as the per-asset "Raise a Service Request" form, just with the asset picked from a list instead of already being on that asset's page).
- **Open Support Ticket** (secondary button) — links to the `/tickets` queue built earlier.
- **Start Live Call** — shown as a disabled "Soon" item, same treatment as the unbuilt sidebar sections. Per your call: live chat/calling is a real feature you want to build later, not something to fake a link for now.

## Setup steps

1. No SQL to run.
2. `npm run dev`, sign in as staff, click "Request New Service" on the dashboard, pick an asset, submit — confirm it lands you back on `/tickets` with a "Service request submitted" banner and the new ticket shows up in the queue.
3. Click "Open Support Ticket" and confirm it goes straight to the queue.
4. Confirm "Start Live Call" is visibly inert (no click target) and tagged "Soon."
5. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

---

# SLA Historical Performance widget

No schema changes, no new dependencies — the chart is hand-rolled with plain divs (no charting library), same approach as the SLA Performance ring.

## What's here

A 5-bar weekly chart on the dashboard: for each of the last 5 rolling 7-day windows (`W-4` through `This wk`), it shows what percent of tickets *resolved* that week were closed within the 48h target. Bucketed by `resolved_at`, not `created_at` — the question this chart answers is "how did we perform closing tickets that week," not "how are tickets created that week doing."

Because this reuses the same `resolved_at` field the SLA Performance widget just started tracking, **the chart will be mostly empty on a fresh dataset** — that's expected, not a bug. A week with zero resolved tickets shows as "—" with a bar, not a fake 0%. There's a small note under the chart title when there's no data at all yet in the last 5 weeks.

Bars are colored the same way as the SLA ring: green ≥80%, amber ≥50%, red below that.

## Setup steps

1. No SQL to run.
2. `npm run dev`, sign in as staff, resolve a couple of tickets (Start Progress → Mark Resolved on a few different assets), then check the dashboard — "This wk" should start showing a real percentage.
3. Hover a bar to see the tooltip (`X% of Y resolved`, or "No tickets resolved this week").
4. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## Still to come

Recent Activity & Inspections is the last widget from the reference screenshots. The "Recent Activity" half is buildable now from the audit log + tickets we already track; "Inspections" isn't a feature yet and would need to be scoped as its own thing (separate from the existing Inventory Cycles) before it can show real data.

---

# Recent Activity widget

No schema changes, no new dependencies. Sits next to the SLA Historical Performance chart on the dashboard (chart takes 2/3 width, this takes 1/3, matching the reference layout).

## What's here

A feed of the last 8 audit log entries, across every table that's already audited — assets, service tickets, and inventory cycles — turned into plain-language activity lines instead of raw table/action/diff rows:

- **Assets**: "Asset Added / Updated / Removed" + the asset tag + its current status badge.
- **Tickets**: "Ticket Opened / In Progress / Resolved" + the same `TKT-XXXXXXXX` reference used on the `/tickets` queue, plus which asset and client it's for.
- **Inventory Cycles**: "Inventory Cycle Started / Completed / Updated" + the cycle's label.

Everything here is real — pulled straight from `audit_log`, which already captures a full snapshot of the row on every insert/update/delete (see `log_audit()` in `schema.sql`), so there's nothing invented to build this. One small addition: ticket audit rows only carry an asset ID, not the asset's tag or client name, so there's a tiny follow-up query that looks up just the assets referenced on that page of activity.

This intentionally does **not** include "Inspections" from the reference screenshots — that's not a feature that exists yet (it's different from the Inventory Cycles we do have), so nothing was added to fake it.

## Setup steps

1. No SQL to run.
2. `npm run dev`, sign in as staff, and check the dashboard — you should see recent asset edits, ticket status changes, and inventory cycle activity you've already generated while testing the earlier widgets.
3. Click an entry and confirm it takes you to the right asset or inventory cycle page.
4. Confirm client_viewer accounts don't see this card at all (staff-only row, like the other four widgets).
5. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## Where things stand

That's every widget from the original HorizonCare360 reference screenshots now built with real data: Active Support Tickets, System & Equipment Health, SLA Performance, Quick Action Center, SLA Historical Performance, and Recent Activity. Nothing on the dashboard is fabricated — every number, badge, and chart traces back to an actual Supabase query. The only screenshot element intentionally left out is "Inspections," which isn't a feature yet.

---

# Login page redesign — real logo, grid-texture branding

Replicates the reference login screenshot's split-screen design: dark navy left panel with a subtle grid texture and blue glow, the real HorizonCare360 logo, bold headline, and address footer; a plain dark sign-in form on the right.

## New assets

Cropped the logo file you uploaded into two PNGs in `ams-web/public/`:

- `logo-mark.png` — just the icon (gear/chart/arrows mark), used everywhere small: the sidebar header and the login page. Replaces the placeholder "HC" gradient badge that was there before.
- `logo-full.png` — the icon plus the "HorizonCare360" wordmark, saved for later if you want the full lockup somewhere (not used in the UI yet).

## Deliberate deviations from the reference

A few things in the reference screenshot don't map cleanly onto what actually exists yet, so instead of faking them:

- **"CLIENT PORTAL" → "HorizonCare360 Portal"** — the reference screenshot is client-facing copy, but this login page serves both staff and clients (role is decided after sign-in). Relabeled so it's accurate for both.
- **"SEC-registered counterparty" dropped** — that's financial-industry language that doesn't apply to Phtek; replaced with "Protected environment · Role-based access control," which is actually true (RLS + role-based RBAC).
- **"Forgot password?" is inert, not a dead link** — there's no password-reset flow built yet. It's shown (matching the design) but greyed out with a tooltip explaining a staff admin can reset it in Supabase for now. Say the word if you want a real self-service reset flow built.
- **"Remember me" is a plain checkbox** — sessions already persist via cookies regardless of its state (that's the existing Supabase Auth default), so it's cosmetic for now, not a functional toggle.

## Setup steps

1. No SQL to run.
2. `npm run dev` and check `/login` — confirm the logo renders (it's a local file in `public/`, no external URL), the grid texture and glow show up on the left panel, and the sidebar logo (after signing in) also updated.
3. As always: only syntax-checked in this session, not run through a real build — send me the exact error if `npm run dev` or Vercel's build throws one.

---

# Topbar redesign + real dark/light theme toggle

This one touched almost every file in the app, but mechanically — it's a rename, not a rewrite. No new dependencies.

## How the toggle actually works

Every themed color in the app (`bg-base`, `bg-surface`, `border-hairline`, the `text-ink`/`text-ink-soft` text tokens, and the amber/emerald/red/blue "400" status shades) now reads from CSS variables defined in `app/globals.css` — dark values under `:root`, light values under a `.light` class. Clicking the sun/moon button in the topbar (`components/theme-toggle.tsx`) toggles that `.light` class on `<html>` and saves the choice to `localStorage`. Because it's the *same* color tokens flipping everywhere — not a `dark:`-prefixed twin class on every element — the whole app re-themes at once, not just the topbar. A small inline script in `app/layout.tsx` applies the saved theme before first paint, so there's no flash of the wrong theme on reload.

The mechanical part: every page's `text-white` / `text-slate-200` became `text-ink`, and `text-slate-300` / `text-slate-400` became `text-ink-soft` (105 replacements across 16 files) — those were the only text colors that would've gone invisible or low-contrast against a white background. `text-slate-500` and `text-slate-600` were left alone; they read fine on both a dark surface and a white one.

## Topbar layout

Matches your reference: title/subtitle on the left, then search box, "All Sites" filter, the theme toggle, and a notification bell on the right. Page-specific action buttons (Add Asset, Export CSV, Request New Service, etc.) that used to live in the topbar now render as a row at the top of the page content instead — the reference topbar has no room for them, so they moved down one level. Nothing about those buttons changed functionally, just where they sit.

## What's real vs. what's not (yet)

- **Theme toggle**: real, works, persists.
- **Search box, "All Sites" filter, notification bell**: visible for layout parity with your reference, but intentionally inert — disabled, with a tooltip explaining they're not wired up. None of them fake functionality; nothing happens if you click them. Search and site-filtering would each be a real (and reasonably sized) feature to build on top of what already exists in the schema; the bell is a natural fit for the certs-expiring / unserviceable / SLA-breach data the dashboard already computes, if you want that as a next step.

## Setup steps

1. No SQL to run.
2. `npm run dev`, sign in, and click the sun icon in the top-right — confirm the whole app (not just the topbar) switches to a light theme, the icon becomes a moon, and reloading the page keeps the light theme (no flash back to dark first).
3. Toggle back to dark and confirm the same in reverse.
4. Spot-check a few pages (Assets, an asset detail page, Inventory) in light mode for any low-contrast text — I've mapped every text color used, but I can't run a real build or take a screenshot in this environment, so a visual pass on your end is the real check here.
5. As always: only syntax-checked in this session — send me the exact error (or a screenshot of anything that looks off) if `npm run dev` or Vercel's build throws one.

---

# Clients module — the first of several "match the reference" modules

You connected the actual source of the HorizonCare360 reference (a separate app, `horizoncare-360`, built on a different stack with its own Supabase project) and asked me to bring AMS up to feature parity: all its tabs/modules, matching design, real database tables on our own Supabase project, and eventually its live chat + calling feature.

That's a big scope — bigger than everything built so far in this project combined, including a full WebRTC voice/video calling system in the reference. We agreed to do it in phases, simple modules first. This is phase 1: **Clients**.

## An important adaptation, not a literal copy

The reference has separate `clients` and `machines` tables. AMS already has the same real-world entities under different names: `organizations` (= their `clients`) and `assets` (= their `machines`), and our RLS/client-portal security model is already built around `organization_id`. Adding parallel `clients`/`machines` tables would just split the same data across two schemas with no way to keep them in sync — the client portal would show one asset list, the new "Clients" admin view would show another. So instead of copying their schema literally, **`schema_step8.sql`** adds the one genuinely missing field (`email`) to `organizations`, and adds audit logging to `organizations` and `sites` (every other editable entity already has it, these two didn't).

## What's here

- **`/clients`** — staff-only list of every client organization, with a real client-side search box (name/sector/contact/email), plus site and asset counts per client.
- **`/clients/new`** — add a client (name, sector, primary contact, email).
- **`/clients/[id]`** — client detail: editable client info, its sites (with an inline "add site" form), and its registered assets (linking to the existing asset detail pages — no duplicate asset UI).
- Sidebar "Clients" link is now live instead of "Soon".

## Setup steps

1. Run `schema_step8.sql` in Supabase.
2. `npm run dev`, sign in as staff, go to Clients, add a test client, add a site to it, then check that client's existing assets (if any) show up correctly scoped.
3. Confirm client_viewer accounts still don't see "Clients" in the sidebar and can't reach `/clients` directly (staff-only, same `requireStaff()` pattern as everywhere else).
4. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## What's next

Work Orders, then Alerts, Inspections, Calendar, Reports, Fleet Map, and finally the big one — live chat + WebRTC calling — per the order you picked.

## Follow-up — reverted the topbar's visual redesign, kept the toggle

The search box, "All Sites" filter, and notification bell from the reference screenshot are gone again — back to the plain topbar (title/subtitle on the left, real page action buttons on the right). The dark/light toggle stays, now living in that original topbar layout, and the theming system underneath it (CSS variables in `globals.css`, the `text-ink`/`text-ink-soft` tokens) is untouched since that's what makes the toggle actually work app-wide. Page action buttons (Add Asset, Export CSV, etc.) also moved back into the topbar itself instead of the row above page content.

---

# Work Orders module — phase 2 of "match the reference"

Phase 2 of the build order: **Work Orders**, the internal maintenance-operations queue.

## Staff-only, unlike Tickets

Checked the reference's `/work-orders` route before building this: it calls a `useClientRedirect()` hook that bounces any client-role user straight back to their dashboard. So unlike `service_tickets` (which clients can raise and view for their own assets), `work_orders` is staff-only end to end — same RLS pattern as `inventory_cycles` (Step 5), not the shared staff-manage/client-read pattern tickets use. Sidebar-wise that means Work Orders only ever shows up for staff, same as Clients and Inventory.

Also reused the existing `ticket_priority` enum (low/medium/high) instead of inventing a parallel priority type for work orders — same scale, and `StatusBadge` already has colors wired up for those three values, so no UI changes needed there.

## What's here

- **`schema_step9.sql`** — new `work_orders` table (asset, task title, description, work type, priority, status, lead technician, due date), `work_order_status`/`work_order_type` enums, audit trigger, staff-only RLS policy.
- **`/work-orders`** — staff-only queue with filter pills (All Open / High Priority / In Progress / Completed, matching the reference's filter bar) and an inline status dropdown per row for quick updates without leaving the list.
- **`/work-orders/new`** — create a work order against any asset (asset picker, task title, description, work type, priority, lead technician, due date).
- Sidebar "Work Orders" link is now live instead of "Soon".
- No detail/edit page — the reference itself doesn't have one either, just the list with inline status changes and a create form, so this matches it exactly rather than adding scope it doesn't have.

## Setup steps

1. Run `schema_step9.sql` in Supabase (after `schema_step8.sql`, if you haven't already).
2. `npm run dev`, sign in as staff, go to Work Orders, create one against an existing asset, then change its status from the dropdown in the list and confirm it moves between filter pills correctly (e.g. marking it "Completed" drops it out of "All Open").
3. Confirm client_viewer accounts still don't see "Work Orders" in the sidebar and can't reach `/work-orders` or `/work-orders/new` directly.
4. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## What's next

Alerts, then Inspections, Calendar, Reports, Fleet Map, and finally live chat + WebRTC calling.

---

# Alerts module — phase 3 of "match the reference"

Phase 3: **Alerts**, the monitoring feed.

## Another adaptation worth flagging

The reference's `/alerts` route looks like a live telemetry feed, but checking its own seed data shows it's hand-inserted rows ("Uptime below SLA threshold", "Contract renewal upcoming") — it doesn't actually have a real monitoring/IoT source behind it either. AMS doesn't have that kind of automated pipeline yet, so **`schema_step10.sql`** builds this as a staff-logged alert feed instead: staff record something they've spotted (a site visit, a phone call, whatever), tag it with a severity, and it shows up in the feed with read/resolved tracking. The `alerts` table is shaped so a future automated source — say, a scheduled job that checks `next_service_due` or `warranty_end_date` on assets and raises an alert automatically — could write into the same table later with no UI changes. Same staff-only pattern as Work Orders: the reference redirects clients away from `/alerts` too.

I also split "severity" and "resolved state" into two separate fields (`severity` + `resolved_at`/`is_read`) rather than reusing severity as a catch-all status like the reference does (its `severity` column holds values like `"RESOLVED"` alongside `"CRITICAL"`/`"CAUTION"`) — same kind of separation-of-concerns fix as `ticket_status` vs. `ticket_priority` elsewhere in AMS.

## What's here

- **`schema_step10.sql`** — new `alerts` table (title, description, severity, optional asset link, read/resolved tracking), `alert_severity` enum, audit trigger, staff-only RLS policy.
- **`/alerts`** — feed with colored severity bars/icons (critical = red, caution = amber, info = blue), filter pills (All / Unread / Critical / Caution), and inline "Mark Read" / "Resolve" buttons per alert.
- **`/alerts/new`** — log an alert (title, description, severity, optional related asset).
- `StatusBadge` now also knows `critical`/`caution`/`info`.
- Sidebar "Alerts" link is now live instead of "Soon".

## Setup steps

1. Run `schema_step10.sql` in Supabase (after Steps 8 and 9, if you haven't already).
2. `npm run dev`, sign in as staff, go to Alerts, log a test alert with each severity, then try "Mark Read" and "Resolve" on one and confirm it moves correctly between the filter pills.
3. Confirm client_viewer accounts still don't see "Alerts" in the sidebar and can't reach `/alerts` or `/alerts/new` directly.
4. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## What's next

Inspections, then Calendar, Reports, Fleet Map, and finally live chat + WebRTC calling.

---

# Inspections module — phase 4 of "match the reference"

Phase 4: **Inspections**, the field checklist.

## What the reference actually does (and where AMS goes further)

The reference's `/inspections` route is staff-only and only ever shows the single most recent inspection record — there's no list in the UI and no way to start a new one from the app itself (its "Start Inspection" flow isn't wired up). AMS keeps its three-category checklist shape (Exterior & Safety / Imaging & Detection / System & Software, tap-to-cycle pass → attention → fail) but makes it a real workflow: every inspection ever run shows up in a list, staff can start a new one against any asset, and each one gets its own detail page — closer to how the existing Inventory Cycles module (Step 5) already works than to the reference's single-record view.

## What's here

- **`schema_step11.sql`** — new `inspections` (asset, technician, date, draft/submitted status) and `inspection_items` (category, item name, pass/attention/fail result) tables, audit triggers on both, staff-only RLS.
- **`/inspections`** — list of every inspection with asset, technician, date, pass/total score, and status.
- **`/inspections/new`** — pick an asset, technician, and date; a standard 12-item checklist across the three categories is bulk-created automatically, same pattern as starting an inventory cycle.
- **`/inspections/[id]`** — the checklist itself, grouped by category, each item's status as a tappable pill that cycles pass → attention → fail → pass. "Submit & Sign Off" locks it to read-only in the UI (RLS still lets staff correct it later if genuinely needed — same defense-in-depth approach as everywhere else).
- `StatusBadge` now also knows `draft`, `submitted`, and `attention`.
- Sidebar "Inspections" link is now live instead of "Soon".

## Setup steps

1. Run `schema_step11.sql` in Supabase (after Steps 8–10, if you haven't already).
2. `npm run dev`, sign in as staff, go to Inspections, start one against an asset, tap a few items to cycle their status, then Submit & Sign Off and confirm the checklist becomes read-only.
3. Confirm client_viewer accounts still don't see "Inspections" in the sidebar and can't reach `/inspections` directly.
4. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## What's next

Calendar, then Reports, Fleet Map, and finally live chat + WebRTC calling.

---

# Calendar module — phase 5 of "match the reference"

Phase 5: **Calendar**, and the first module in this phase that's actually client-visible.

## Checked visibility before building this one

Work Orders, Alerts, and Inspections all turned out to be staff-only in the reference (each route redirects client-role users away). Before assuming Calendar was the same, I checked the reference's nav component directly — its `clientHidden` list is `["work-orders", "tickets", "inspections", "alerts", "clients", "support-inbox"]`, and Calendar isn't in it. So clients do see the calendar in the reference app, and `calendar_events` in AMS follows the shared staff-manage / client-read RLS pattern (same as `service_tickets`) instead of the staff-only pattern from Steps 9–11.

Also skipped the reference's separate `location` text column on each event — AMS already knows an event's site through `asset_id → sites → address`, so location is derived through that relation on display instead of duplicated as a field that could go stale.

## What's here

- **`schema_step12.sql`** — new `calendar_events` table (asset, title, type, date, status, notes), `calendar_event_type`/`calendar_event_status` enums, audit trigger, shared staff-manage/client-read RLS.
- **`/calendar`** — month grid (previous/next/today navigation) with color-coded events by type (calibration/maintenance/firmware/inspection/other), plus an "Upcoming" side panel. Visible to both staff and clients — clients only see events tied to their own organization's assets, same scoping as everywhere else.
- **`/calendar/new`** — staff-only: schedule an event against an asset (title, type, date, notes).
- "Mark Completed" quick action on upcoming events, staff-only.
- "Overdue" is computed on the fly (scheduled + date in the past = shown in red) rather than needing a background job to flip a status column.
- `StatusBadge` now also knows `scheduled` and `overdue`.
- Sidebar "Calendar" link is now live instead of "Soon" — and, matching the reference, it's not staff-only in the nav.

## Setup steps

1. Run `schema_step12.sql` in Supabase (after Steps 8–11, if you haven't already).
2. `npm run dev`, sign in as staff, go to Calendar, schedule an event for an asset, confirm it shows up on the right day in the grid and in the Upcoming panel, then try "Mark Completed."
3. Sign in as a client_viewer and confirm Calendar is visible (unlike Work Orders/Alerts/Inspections) but scoped to only that client's own assets, with no "+ Schedule Event" button.
4. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## What's next

Reports (plus the corrective/preventive checklist sub-pages), then Fleet Map, and finally live chat + WebRTC calling.

---

# Reports module — phase 6 of "match the reference"

Phase 6: **Reports**, plus the preventive and corrective checklist sub-pages you asked about specifically.

## The real find in this one: service_records never had a UI

Before building anything, I checked what the reference's Reports page actually pulls from — its own `pm_reports` / `cm_reports` tables, which don't correspond to anything in AMS. But AMS already has `service_records` (built all the way back in Step 1 — service_type, date_performed, performed_by, findings, result, next_due_date) sitting completely unused: no page anywhere in the app has ever let anyone create one. So this phase isn't just a reporting dashboard — the preventive and corrective checklist forms are the first real way to log a maintenance visit against an asset. Everything they submit becomes a genuine `service_records` row, immediately visible wherever service records already show up (audit log, and now the Reports history lists).

## What I deliberately did NOT replicate

The reference's checklist forms also do PDF generation, signature capture, CSAT satisfaction ratings, and photo upload — all backed by a Supabase Storage bucket and a client-side PDF library. That's a project of its own, not a couple hours of scope. I've left it out entirely rather than half-building it, and I'm flagging it here explicitly so it doesn't look like it was missed by accident. Say the word if you want that as its own phase later.

## What's here

- **`schema_step13.sql`** — adds `downtime_hours` to `service_records` (needed for corrective reports, nothing tracked it before), plus a new `service_record_checklist_items` child table (same sibling pattern as the existing `service_record_parts`) to hold the section-by-section OK/Attention/Fail detail from the PM checklist.
- **`/reports`** — client-and-staff-visible (checked the reference's nav code again — Reports isn't in `clientHidden` either, same as Calendar). Equipment health KPIs, service ticket summary with CSV export, and Preventive/Corrective maintenance history pulled straight from `service_records`, each with its own CSV export.
- **`/reports/preventive-checklist`** (staff-only) — the same 5-section, 15-item checklist structure as the reference (External Parts, Moving Components, Internal Parts, Safety Parts, Software), tap-to-cycle OK → Attention → Fail per item with an optional remarks field. Submitting creates a `service_records` row (`service_type = preventive_maintenance`) plus all 15 checklist item rows.
- **`/reports/corrective-checklist`** (staff-only) — free-text fault description, root cause, corrective action, parts replaced, downtime hours, and outcome (matches the reference, which also skips the checklist grid for corrective reports). Creates a `service_records` row (`service_type = repair`) and, if parts were listed, real `service_record_parts` rows.
- Two new CSV export endpoints: `/api/reports/tickets/export` and `/api/reports/service-records/export?type=preventive|corrective`, following the same pattern as the existing `/api/assets/export`.
- Sidebar "Reports" link is now live instead of "Soon," and — like Calendar — it's not staff-only in the nav.

## Setup steps

1. Run `schema_step13.sql` in Supabase (after Steps 8–12, if you haven't already).
2. `npm run dev`, sign in as staff, go to Reports → Issue New Report, submit a preventive checklist against an asset (try flagging an item as Fail), then submit a corrective report with a couple of parts replaced. Confirm both show up in the Maintenance History lists on `/reports` and on that asset's own page.
3. Try both CSV export links and confirm the files download with real data.
4. Sign in as a client_viewer and confirm Reports is visible (like Calendar) but scoped to their own org, with no "Issue New Report" section.
5. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## What's next

Fleet Map, then the big one — live chat + WebRTC calling.

---

# Fleet Map module — phase 7 of "match the reference," and the last "simple module"

Phase 7: **Fleet Map**. This is the last module before the big one — live chat + WebRTC calling.

## Real sites, not a fictional deployment list

The reference's Fleet Map plots a hardcoded list of 17 named Philippine airports and ports, matched against a free-text `assets.site` column by string comparison. That list is specific to the reference's demo data — it's not Pacific Horizon Tek's actual client sites. AMS already has real, relational sites (`organizations → sites → assets`), so the map plots those instead: whichever sites staff has added coordinates to, aggregated by their real assets' real status. The only genuinely missing piece was coordinates, so `schema_step14.sql` just adds nullable `latitude`/`longitude` to the existing `sites` table.

Since most existing sites predate this and don't have coordinates yet, I also extended the Clients page (`/clients/[id]`) — the "Add Site" form now has optional lat/lng fields, and every existing site in the list gets its own small "Save Location" form so you can retrofit coordinates without recreating anything. A site shows "Not on Fleet Map yet" until it has both values set.

## The map itself

I did reuse one thing directly from the reference: the Philippines coastline outline data (`lib/philippines-geo.ts`). It's generated from Natural Earth's 10m Admin-0 Countries dataset, which is public domain — not proprietary code, just an accurate shape of the actual coastline, same as using any other public map data. Everything around it (the pan/zoom/drag interaction, the projection math, the pins, the legend, the info card, the side panel) is written fresh against AMS's data and component conventions.

Site status on the map is asset-status-driven, adapted to AMS's real `asset_status` enum instead of the reference's simplified up/down flag:
- **Down** (red) — the site has at least one `unserviceable` asset.
- **Attention** (amber) — no unserviceable assets, but at least one `under_maintenance`.
- **No Assets** (slate) — the site has coordinates but no assets registered yet.
- **Operational** (emerald) — everything at that site is operational.

## What's here

- **`schema_step14.sql`** — adds `latitude`/`longitude` to `sites`.
- **`lib/philippines-geo.ts`** — Natural Earth coastline path data (public domain), used as the map backdrop.
- **`/fleet-map`** — client-and-staff-visible (checked the reference's nav code once more — Fleet Map isn't in `clientHidden` either). Interactive map: scroll to zoom, drag to pan, click a pin or a sidebar row to pin its info card, zoom controls, a legend, and a live readiness summary (sites down, sites with no assets, total units down).
- **`/clients/[id]`** — "Add Site" form now takes optional lat/lng; every existing site has its own inline "Save Location" mini-form.
- Sidebar "Fleet Map" link is now live instead of "Soon," and — like Calendar and Reports — it's not staff-only.

## Setup steps

1. Run `schema_step14.sql` in Supabase (after Steps 8–13, if you haven't already).
2. `npm run dev`, sign in as staff, go to a client's page, add coordinates to a site or two (any real lat/lng works — e.g. Manila is roughly 14.5995, 120.9842), then go to Fleet Map and confirm the pin shows up in the right spot with the right color for that site's asset mix.
3. Try zoom/pan, click a pin, click a sidebar row, and confirm the info card and "View client" link work.
4. Sign in as a client_viewer and confirm Fleet Map is visible (like Calendar/Reports) but only shows their own org's sites.
5. As always: only syntax-checked in this session — send me the exact error if `npm run dev` or Vercel's build throws one.

## What's next

The last phase: live chat + WebRTC calling. This one's genuinely large — comparable in size to everything built in phases 1–7 combined — and needs one thing from you first: your own TURN relay account (e.g. a free Metered.ca account), since the reference's credentials aren't ours to reuse. I'll flag exactly what's needed when we start that phase.

---

# Housekeeping — fixed sidebar, and a real header on Dashboard/Assets

Two small requested fixes, not part of the phased build:

- **Sidebar now stays put while you scroll.** `components/sidebar.tsx`'s `<aside>` is `sticky top-0` (matching the pattern the topbar already used) — it no longer scrolls away on tall pages like Reports.
- **Dashboard header**: title/subtitle changed to "Operations Control Center" / "Fleet-wide oversight across clients, machines, and tickets." The old "View Assets" button is gone, replaced with a real search bar and a notification bell.
  - The search bar (`components/search-bar.tsx`) is a plain GET form to `/assets?q=...` — no client JS, and it actually filters (asset tag/brand/model) once you land there. Reused the same component on the Assets page itself so the query stays visible and editable.
  - The bell (`components/notification-bell.tsx`) shows a small red dot when there's at least one unread Alert (`is_read = false`) and links to `/alerts`. A client_viewer clicking it just gets redirected to `/assets` by the existing `requireStaff()` guard on that page — same graceful fallback as everywhere else Alerts is staff-only.

## Setup steps

No SQL to run — this is UI-only. `npm run dev`, check that the sidebar holds still while scrolling a long page, and try the search bar (e.g. search part of an asset tag) from both Dashboard and Assets.

## Follow-up — notification bell dropdown

The bell now opens a dropdown on click instead of just linking straight to `/alerts`: latest 5 unread-aware alerts (with severity badge) and the latest 5 Recent Activity entries (same data the dashboard's Recent Activity card already uses), each row clickable, closes on outside click/Escape/picking a row. `components/notification-bell.tsx` is now a client component; the two extra data queries live in `dashboard/page.tsx`.

## Follow-up — Assets page: title, row actions menu, and delete

- Title/subtitle changed to "Managed Assets" / "Asset registry across all sites."
- Every row now has a three-dot menu (staff only) with **Edit** (goes to the existing edit page) and **Delete**. There's no separate "Update" entry — editing an asset's status/fields *is* updating it, so a third option would've just duplicated Edit.
- Delete is real and cascading: every table that references an asset (service records, tickets, certificates, work orders, alerts, calendar events, inspections, inventory items) was declared `on delete cascade` back when those tables were created, so deleting an asset removes its full history at the database level. The row menu confirms this in plain language before submitting — it's not reversible.
- New `deleteAsset` server action in `app/assets/actions.ts`, staff-only via `requireStaff()` same as everywhere else.

**On your question — does "+ Add Asset" really write to Supabase?** Yes. `createAsset` in `app/assets/actions.ts` does a real `supabase.from("assets").insert(values)` — nothing in this app is mocked or held in memory; every create/edit/delete action across every module goes straight to your Supabase Postgres database, scoped by the same RLS policies that control who can see what.

## Setup steps

No SQL to run for either of these two — UI and server actions only. `npm run dev`: click the bell and confirm the dropdown shows real alerts/activity; on Assets, open a row's three-dot menu, try Edit, then try Delete on a test asset and confirm the confirmation dialog appears and the row disappears after confirming.

## Follow-up — "Asset Tag" renamed to "Asset ID," and it's now auto-generated

- Every user-facing label that said "Asset Tag" (the Assets table header, the asset form, and all three CSV export headers) now says "Asset ID." The underlying database column is still named `asset_tag` — renaming a live column isn't worth the migration risk for what's purely a label change, and nothing outside the UI cares what it's called.
- On **`/assets/new`**, the Asset ID field is gone — it's generated automatically once you save, based on Equipment Type: `XRY-0001` for X-ray Screening, `PTS-0001` for People/Threat Screening, `WTR-0001` for Water Generation, `PMP-0001` for Pump, `OTH-0001` for Other. Each prefix has its own counter (so your 50th X-ray unit is `XRY-0050` regardless of how many pumps exist).
- The generator looks at the *highest* existing number for that prefix, not a row count — so if `XRY-0003` ever gets deleted, the next X-ray asset still becomes `XRY-0004`, not a reissued `XRY-0003`.
- On the **edit page** (`/assets/[id]`), Asset ID stays a normal editable field, in case a real correction is ever needed — auto-generation only applies at creation time.

## Setup steps

No SQL to run. `npm run dev`, sign in as staff, add a couple of new assets of different equipment types and confirm the IDs come out as `XRY-0001`, `PMP-0001`, etc. without you typing anything, then confirm editing an existing asset still lets you change its Asset ID manually if needed.

## Follow-up — three-dot menu no longer gets clipped

Bug: on rows near the bottom of the Assets table, the three-dot menu's dropdown opened but was invisible. Cause: the table's wrapper div (`overflow-hidden`, for the rounded corners) clips any normal absolutely-positioned child that would render outside its box — which is exactly what a dropdown on a bottom-row does.

Fix: `app/assets/asset-row-actions.tsx` now renders the dropdown through a React portal straight into `document.body`, positioned with `position: fixed` at coordinates computed from the three-dot button's own `getBoundingClientRect()` at the moment it's opened. That sidesteps the ancestor's `overflow-hidden` entirely. Since the position is a one-time snapshot, the menu closes itself if the page scrolls or the window resizes rather than drifting away from its button.

## Follow-up — Site is now a text field, and there's a Cancel button

- **Site** on the Add/Edit Asset form was a dropdown limited to sites already on file. It's now a plain text box — type the address directly. Under the hood it still resolves to a real `site_id` (Fleet Map and the Clients page both depend on that relationship): on save, `resolveSiteId()` in `app/assets/actions.ts` looks for an existing site on that client with a matching address (case-insensitive) and reuses it, or creates a new site row on the fly if there's no match. Leaving it blank still means "no specific site," same as before.
  - One thing worth knowing: a site created this way has no lat/lng yet, so it won't show up on Fleet Map until someone adds coordinates for it from the client's page — same as any manually-added site today.
- **Cancel button** added next to Save/Update Asset — takes you back to `/assets` without submitting.
- Since Site no longer needs to filter by the selected Organization, `asset-form.tsx` dropped its client-side state entirely and is a plain server component again.

## Setup steps

No SQL to run — UI and server action only. `npm run dev`, sign in as staff: on Add Asset, type a brand-new address into Site and save, then check the client's page and confirm a new site was created with that address. Try it again with the *same* address for the same client and confirm it reuses the existing site rather than creating a duplicate. Also click Cancel from both Add and Edit Asset and confirm it returns to `/assets` with nothing saved.

## Follow-up — new sites get a location automatically

**On the "detailed 2D map" question**: the Fleet Map view (`app/fleet-map/fleet-map-view.tsx`) was already built from the exact same source as the reference — same Natural Earth coastline data (`lib/philippines-geo.ts`), same projection math, same zoom/pan/pin/legend interaction. Nothing needed to change there visually; the reason it was looking sparse is the real issue below.

**The real gap**: a site created through the Assets page's free-text Site field (or the Clients "Add Site" form) had no coordinates unless someone manually typed lat/lng — so it silently never showed up on Fleet Map. New helper, `lib/site-location.ts`, fixes that by resolving a location automatically whenever a site is created without one:

1. **Known-facility match first** (`lib/ph-locations.ts`) — a small keyword table of the airports/seaports/freeports PHTek actually deploys to (NAIA, Clark, Subic, Cebu/Mactan, Davao, Zamboanga, etc., with real published coordinates — the same real-world facilities the reference's fleet map used). If the typed address mentions one, it resolves instantly with no network call.
2. **Live geocoding fallback** (`lib/geocode.ts`) — anything that doesn't match a known facility gets looked up via OpenStreetMap's free Nominatim geocoder, scoped to the Philippines. No API key needed. If that also comes up empty (unreachable, no match, etc.), the site is just left uncharted — exactly today's behavior — and can still be set by hand from the Clients page's "Save Location" mini-form, which always overrides anything automatic.
3. Wired into both places a site can be created: `resolveSiteId()` in `app/assets/actions.ts`, and `createSite()` in `app/clients/actions.ts` (only kicks in there if you leave the lat/lng fields blank — a manually typed value always wins).

## Setup steps

No SQL to run. `npm run dev`, sign in as staff, add a new asset with a Site like "NAIA Terminal 3" or "Port of Davao" (or reuse the same client's existing site with the same address to confirm it doesn't create a duplicate) — then check Fleet Map and confirm a pin shows up in roughly the right place without you touching lat/lng. Try an address that isn't a known facility too (e.g. a specific street address) to exercise the geocoding fallback; if Nominatim is unreachable or returns nothing, the site should still save fine, just without a pin, same as before.

## Follow-up — banner removed, and existing sites are backfilled automatically too

Two gaps from the previous follow-up:

- The screenshot showed the amber "N sites without coordinates" banner still up, and only 1 of 8 sites had a pin. Right — auto-geocoding only ran for sites created *after* that change went in; the other 7 predated it and had no coordinates to backfill retroactively.
- Fixed by adding `backfillMissingSiteLocations()` (`lib/site-location.ts`), called at the top of `app/fleet-map/page.tsx` on every load, staff-only: it finds any site with an address but no lat/lng, resolves one via the same known-facility/geocoding logic, and updates it in the database. So opening Fleet Map as staff now quietly catches up any site that slipped through — no separate button, no manual step.
- The banner itself is gone (`FleetMapView` no longer takes a `missingCoords` prop at all) — now that catching up happens automatically on load, a standing "go fix this" notice didn't make sense anymore.

## Setup steps

No SQL to run. `npm run dev`, sign in as staff, open Fleet Map — the sites that showed up in your screenshot without pins should now have them (matched against the known-facility list: Zamboanga, NAIA, Cebu/Mactan, etc.), and the amber banner should be gone. If a site's address doesn't match anything, it'll silently try live geocoding on that same load — refresh once if a couple of pins don't appear immediately.

## Follow-up — asset status widened to match Fleet Map: Operational, Attention, Down, Unserviceable

Previously an asset's status was one of 3 values (Operational / Under Maintenance / Unserviceable), while Fleet Map showed a different 4-value site-level scale (Operational / Attention / Down / No Assets) derived from it — same idea, different words, so the two pages didn't read as the same system. Both now use the identical 4-word scale.

- **`schema_step15.sql`** — widens the `asset_status` enum. `under_maintenance` is renamed to `attention` (a real Postgres `ALTER TYPE ... RENAME VALUE`, so every existing row carries over automatically, no data migration needed). `down` is added as a genuinely new value — previously "temporarily out" and "beyond repair" were both lumped into `unserviceable`; this migration leaves existing `unserviceable` assets as-is rather than guessing which ones are actually just down. Reclassify individually from the Assets page if needed; going forward, pick whichever of the two actually applies.
- **Asset form** (`app/assets/asset-form.tsx`) — Status dropdown is now Operational / Attention / Down / Unserviceable.
- **Status badges** (`components/status-badge.tsx`) — added an `orange` tone for "Down" so it's visually distinct from "Unserviceable" (red) — Operational is green, Attention is amber, Down is orange, Unserviceable is red, ordered by severity.
- **Fleet Map** (`app/fleet-map/page.tsx` + `fleet-map-view.tsx`) — a site's pin now takes the *worst* status among its assets, using the exact same 4-word scale (previously it only distinguished "down" vs "attention" vs "operational"; now it separately recognizes Unserviceable as more severe than Down). The legend lists all 4 in severity order, plus a 5th "No Assets" entry for sites with nothing registered yet — that one's a genuinely different situation (nothing to roll up) so it stays distinct rather than being folded into any of the 4, but I kept it out of your requested 4-word list and appended it after. Let me know if you'd rather it disappear from the legend entirely.
- **Dashboard** — KPI row and the System & Equipment Health widget now show Attention/Down/Unserviceable as three separate counts instead of two.
- **Reports** — the "Needs Attention" card's sub-label updated to say "Attention / down / unserviceable."

## Setup steps

1. Run `schema_step15.sql` in the Supabase SQL editor (after Steps 1–14).
2. `npm run dev`, sign in as staff, open an asset and confirm the Status dropdown shows all 4 options; set a couple of test assets to Attention, Down, and Unserviceable respectively.
3. Check Dashboard — KPI row and System & Equipment Health should show separate Attention/Down/Unserviceable counts.
4. Check Fleet Map — a site with a "Down" asset should show an orange pin, "Unserviceable" a red pin (pulsing/ping like Down did before), and the legend at bottom-left should read Operational, Attention, Down, Unserviceable, No Assets.
5. Any asset that was previously "Under Maintenance" should now show as "Attention" everywhere without you touching it — that's the enum rename taking effect automatically.

## Follow-up — Clients page brought to parity with Assets page

Three asks, all copying patterns already established on `/assets`:

- **Cancel button** — Add Client (`app/clients/new/page.tsx`) and Edit Client (`app/clients/[id]/page.tsx`) both now have a Cancel link next to their submit button, back to `/clients`, same as the Asset form.
- **Three-dot row actions** — every row on `/clients` now has an Edit/Delete menu (`app/clients/client-row-actions.tsx`), same portal-into-`document.body` pattern as `asset-row-actions.tsx` so it isn't clipped by the table's rounded-corner `overflow-hidden` wrapper. Edit goes to the client's existing detail/edit page (no separate "Update" entry, same reasoning as Assets). Delete is a real cascading delete — sites and assets both belong to the org with `on delete cascade` — with a plain-language confirm dialog. One wrinkle handled specifically: if a client_viewer login is tied to that organization, the database refuses the delete (`profiles.organization_id` deliberately isn't cascading — deleting a client shouldn't silently orphan or wipe someone's account), and that shows up as a clear message instead of a raw Postgres error.
- **Search bar** — swapped the old client-side instant-filter box (typed into `ClientsTable`, filtered in the browser) for the same server-driven `<SearchBar>` component `/assets` uses: a plain `?q=` GET form in the page header, filtering `organizations` server-side across name/sector/contact/email. `ClientsTable` is now a plain server component — no more `"use client"`, no local state, just renders whatever list the page passes in.

## Setup steps

No SQL to run — UI and server actions only. `npm run dev`, sign in as staff: try the search bar on `/clients` (search by name, sector, contact, or email), open a row's three-dot menu and try Edit, then try Delete on a test client and confirm the confirm dialog and cascade behavior. Click Cancel from both Add Client and Edit Client and confirm it returns to `/clients` with nothing saved.

## Follow-up — link Service Tickets to the Work Orders they spawn

Discussed keeping Work Orders and Service Tickets as separate concepts (client-facing complaint with an SLA clock vs. staff-only maintenance task — no change there), but added the missing connection between them so a ticket and the work it triggers aren't two disconnected records anymore.

- **`schema_step16.sql`** — adds `service_tickets.work_order_id`, nullable, `references work_orders(id) on delete set null`. Deleting a work order un-links the ticket rather than deleting it.
- **`app/work-orders/actions.ts`** — `createWorkOrder` now accepts an optional `ticket_id`. When present: the new work order's id gets written back onto the ticket, and the ticket is nudged to "In Progress" (with `first_response_at` stamped if it wasn't already) — spawning a work order counts as acknowledging the ticket, same as the explicit "Start Progress" action.
- **`/work-orders/new?ticket_id=...`** — new entry point. Pre-fills the asset, description, and priority from the ticket, shows a banner confirming what it's linked to, and carries `ticket_id` through as a hidden field.
- **Ticket rows** now show either a link to their linked work order (`app/tickets/page.tsx`, and the ticket list on `app/assets/[id]/page.tsx`), or a "+ Create Work Order" link if they don't have one yet and aren't resolved. There's no per-work-order detail page in this module (matches the reference's scope — list + inline status only), so the link goes to `/work-orders` rather than a specific record.
- **Work order rows** (`app/work-orders/work-orders-table.tsx`) show a small "From TKT-XXXXXXXX" tag under the task title when a work order was spawned from a ticket, linking back to `/tickets`.

## Setup steps

1. Run `schema_step16.sql` in the Supabase SQL editor (after Steps 1–15).
2. `npm run dev`, sign in as staff, open a client's asset, raise a test ticket (or use an existing open one), then click "+ Create Work Order" on it — confirm the new-work-order form is pre-filled and shows the "Creating from ticket…" banner.
3. Submit it, and confirm: you land back on the asset page with a "linked" banner, the ticket now shows "In Progress" and a link to the work order, and the work order itself (on `/work-orders`) shows a "From TKT-XXXXXXXX" tag linking back to `/tickets`.
4. Check `/tickets` too — the new "Work Order" column should show the same link, and "+ Create" for any other open/in-progress ticket that doesn't have one yet.

## Follow-up — link a ticket from the plain "Create Work Order" form too

Gap in the last follow-up: linking only worked if you started from a ticket's own "+ Create Work Order" link (`?ticket_id=...`). Starting from the plain "+ Create Work Order" button on `/work-orders` gave no way to pick a ticket at all — `createWorkOrder` supported it, but the form never offered it.

`app/work-orders/new/page.tsx` now covers that path too: when there's no `ticket_id` in the URL, it queries unresolved tickets that aren't already linked to a work order and shows them in an optional "Link to Ticket" dropdown, labeled with the ticket ref, asset, and a snippet of the description. Picking one behaves exactly like arriving via the ticket's own link — the ticket moves to In Progress and gets pointed at the new work order once you submit.

**To answer your question directly: no, creating a ticket never auto-creates a work order, by design** — a lot of tickets get resolved without one (a quick remote fix, a duplicate, etc.), so making one is a deliberate staff action, not automatic. If you want a work order for a ticket, either click "+ Create Work Order" next to it (on `/tickets` or the asset's page), or now, pick it from the dropdown when creating one from `/work-orders` directly.

## Setup steps

No SQL to run — this only touches the form. `npm run dev`, sign in as staff, go to `/work-orders` → "+ Create Work Order" (not through a ticket this time) and confirm the "Link to Ticket" dropdown appears and lists your open ticket. Pick it, submit, and confirm the ticket shows the link and moved to In Progress, same as the other path.

## Follow-up — Assets table: "Next Service Due" swapped for "Site"

The Assets table column now shows each asset's site address (whatever was typed into the Site field when it was created — see the earlier "Site is now a text field" follow-up) instead of "Next Service Due." `next_service_due` is still a real column and still shown/editable on the asset's own edit page; it just wasn't pulling its weight as a column when most demo assets don't have one set yet, and Site is more useful at a glance. `app/assets/page.tsx`'s query already joined `sites(address)` for search/filtering — this just renders it.

## Setup steps

No SQL to run — UI only. `npm run dev` and check `/assets`: the second-to-last column should now read "Site" and show each asset's site address (or "—" if none is set).

## Follow-up — Work Orders and Tickets: "Asset" column now shows Site

Same swap as the Assets table follow-up: the second column on `/work-orders` and `/tickets` (header renamed from "Asset" to "Site") now shows the linked asset's site address instead of its Asset ID. Organization name still shows underneath, unchanged. Both queries now join through `assets(sites(address))` to get it.

## Setup steps

No SQL to run — UI only. `npm run dev` and check `/work-orders` and `/tickets`: that column should read "Site" and show the site address (or "—" if the asset has none set).

## Follow-up — Asset picker shows Site name too

The Asset dropdowns on `/tickets/new` ("Request New Service") and `/work-orders/new` ("Create Work Order") now show each option as `Organization — Asset ID (Site)`, e.g. "Bureau of Customs (Demo) — XRY-0009 (NAIA Terminal 3, Pasay City)" — same info the tables already show, just visible while you're still picking. Same treatment for the "Creating from ticket…" banner and the "Link to Ticket" dropdown on `/work-orders/new`, which also now show the site alongside the asset.

## Setup steps

No SQL to run — UI only. `npm run dev`, sign in as staff, open "Request New Service" and "Create Work Order" and confirm each asset in the dropdown shows its site in parentheses (assets with no site just show the asset ID with nothing after it).

## Follow-up — Asset picker also shows Serial Number

Extending the last follow-up: every place an asset gets picked when creating a ticket or work order now also shows its serial number, e.g. "Bureau of Customs (Demo) — XRY-0009 (NAIA Terminal 3, Pasay City) · SN HXP60-2024-0117". Covers the same four spots: the Asset dropdown on `/tickets/new` and `/work-orders/new`, the "Creating from ticket…" banner, and the "Link to Ticket" dropdown — assets/tickets with no serial number on file just omit that part.

## Setup steps

No SQL to run — UI only. `npm run dev`, sign in as staff, open "Request New Service" and "Create Work Order" and confirm each asset option shows its serial number after the site.

## Follow-up — Asset ID dropped from the asset picker

The Asset ID no longer shows in the dropdown/labels when creating a ticket or work order — just Organization — Site · SN (serial number), e.g. "Bureau of Customs (Demo) — NAIA Terminal 3, Pasay City · SN HXP60-2024-0117". Same four spots as before: the Asset dropdown on `/tickets/new` and `/work-orders/new`, the "Creating from ticket…" banner (now reads "on {site}" instead of "on {Asset ID}"), and the "Link to Ticket" dropdown.

## Setup steps

No SQL to run — UI only. `npm run dev`, sign in as staff, open "Request New Service" and "Create Work Order" and confirm the Asset ID no longer appears in the option text — just organization, site, and serial number.

## Follow-up — Cancel button added across every "create" form

Audited every form in the app with a single submit button (the same pattern already used on Add/Edit Asset and Add/Edit Client) and added a matching Cancel link back to that section's list page, wherever one was missing:

- `/work-orders/new` — Cancel → `/work-orders`
- `/tickets/new` (Request New Service) — Cancel → `/tickets`
- `/inspections/new` — Cancel → `/inspections`
- `/calendar/new` — Cancel → `/calendar`
- `/reports/corrective-checklist` — Cancel → `/reports`
- `/reports/preventive-checklist` — Cancel → `/reports`
- `/alerts/new` — Cancel → `/alerts`
- `/inventory/new` — Cancel → `/inventory`

Left alone, deliberately:
- The "Raise a Service Request" form on an asset's own page — it's an embedded sub-form, not a standalone page with a list to return to.
- `/inspections/[id]` and `/inventory/[id]` — these already have a "← Back" link in the page header, just not directly next to the submit button.
- The three-dot menu's Delete confirmation forms and the login page — neither fits the "creating a record" pattern this convention is for.

## Setup steps

No SQL to run — UI only. `npm run dev`, sign in as staff, and spot-check a few: Create Work Order, Request New Service, and one of the two report checklists — each should now show a Cancel link next to its submit button that returns to the right list page without saving anything.

## Follow-up — ticket ↔ work order linking wasn't surfacing failures

This exact behavior (Work Order column shows the work order number once one's linked, "+ Create" only when there isn't one yet) was already built in the previous "Link Service Tickets to Work Orders" follow-up — `app/tickets/page.tsx` already branches on `t.work_order_id`. If it looked like nothing changed after creating a work order from a ticket, the most likely cause is **`schema_step16.sql` not having been run yet** in your Supabase project — without the `work_order_id` column, the write-back to the ticket was failing silently (the code wasn't checking that update's result).

Fixed in `app/work-orders/actions.ts`: that update's error is now checked. If linking fails, you're taken back to the asset page with a clear message — "Work order created, but couldn't link it to the ticket: [reason]. Have you run schema_step16.sql yet?" — instead of it just quietly not happening.

## Setup steps

1. **If you haven't already, run `schema_step16.sql`** in the Supabase SQL editor — this is almost certainly why the ticket wasn't updating.
2. `npm run dev`, create a work order from an existing ticket, and confirm: you land back on the asset page with a success banner (or, if something's still wrong, a clear error telling you why), and the ticket on `/tickets` now shows the work order number instead of "+ Create."

## Follow-up — work order creation now always lands on the Work Orders page

Creating a work order from a ticket (either the "+ Create" link in the Ticket Queue or "+ Create Work Order" on an asset's ticket list) used to redirect back to the asset page. Changed to redirect to `/work-orders` instead, matching plain work-order creation — one consistent destination regardless of entry point. If linking back to the ticket fails, the Work Orders page now shows that error directly (amber banner) instead of it living on a page you might not visit.

If the ticket still shows "+ Create" after this, the two most likely causes: (1) `schema_step16.sql` genuinely hasn't been run yet against the live Supabase project, or (2) the deployed site is still running the previous build. Worth confirming both.

## Follow-up — every Work Order now auto-adds a Service Calendar event

**`schema_step17.sql`** (new): adds a `work_order` value to `calendar_event_type`, and a `work_order_id` column on `calendar_events` linking back to the work order that created it.

**`app/work-orders/actions.ts`** — `createWorkOrder` now also inserts a matching `calendar_events` row (title = task title, date = the work order's due date, or today if none was set, notes = description) right after the work order itself is created — regardless of whether it came from the plain "+ Create Work Order" button or from a ticket. `updateWorkOrderStatus` now keeps that calendar entry's status in sync — marking the work order "completed" marks its calendar event completed too.

**`app/calendar/calendar-view.tsx`** — added a cyan color for the new `work_order` event type so it's visually distinct from Calibration/Maintenance/Firmware/Inspection/Other on the calendar grid and the Upcoming list.

The manual "Schedule Event" form on `/calendar/new` intentionally does NOT offer "Work Order" as an option — that type is reserved for auto-generated entries actually linked to a real work order, so manually-added events can't masquerade as ones.

## Setup steps

Run `schema_step17.sql` in the Supabase SQL editor. Until it's run, work orders will still be created fine, but you'll see an error banner noting the calendar entry couldn't be added (same defensive pattern as the step16/ticket-linking fix).

## Follow-up — Reports page headings matched to reference wording

`app/reports/page.tsx` — added the reference's two-line section header style (small blue tracked-out "kicker" label above a larger title, with a gray hint alongside). Section text now matches the reference exactly:
- "Executive Summary" → Equipment Health Overview
- "Service Performance" → Service Ticket Summary
- "Maintenance & Compliance" → Exportable Report Logs (was "Maintenance History")
- "Digital Forms" → Issue New Report

(The reference's separate "Preventive Maintenance Reports Archive" section — a signed-PDF library from Supabase Storage — wasn't ported over, since AMS's preventive/corrective records live as `service_records` rows, not stored PDF files; that data is already covered under "Exportable Report Logs.")

## Follow-up — "Recent Service Tickets" heading added to Reports

The tickets table under Service Ticket Summary now has its own card heading, "Recent Service Tickets," matching the reference — moved the Export CSV button down onto that card header instead of the section header above it, same placement as the reference.

## Follow-up — Customer Satisfaction survey + digital signatures on both report forms

Matched the reference's PM checklist sign-off block on both `/reports/preventive-checklist` and `/reports/corrective-checklist`.

**`schema_step18.sql`** (new) — adds `csat_service`, `csat_machine`, `csat_support`, `csat_overall` (1–5 ratings), `customer_signatory`, `technician_signature`, and `customer_signature` to `service_records`. Signatures are stored as PNG data URLs directly in a `text` column rather than Supabase Storage — no service-role key available in this sandbox to wire up a signed storage bucket, and a few KB of base64 per signature is well within Postgres's text limits.

**`components/customer-survey.tsx`** (new) — the "Customer Satisfaction Rating" card (service / machine / support / overall, 1–5 each), self-contained like the checklist grid: each question keeps its own state and posts as a hidden form field.

**`components/signature-pad.tsx`** (new) — canvas-based signature capture (pointer events, same approach as the reference's `SignaturePad.tsx`), restyled to AMS's theme tokens (reads `--c-ink` at draw time so the pen color stays legible in both dark and light mode). Also self-contained — posts its own hidden field.

**`app/reports/corrective-checklist/`** — split into a thin server `page.tsx` (fetches assets) + new client `corrective-form.tsx` (was previously all in `page.tsx` as a plain server-rendered form), same split `preventive-checklist/` already used — needed since the survey/signature widgets require client-side state.

**`app/reports/actions.ts`** — both `createPreventiveReport` and `createCorrectiveReport` now save the CSAT ratings, customer signatory name, and both signatures via a shared `readSurveyAndSignOff()` helper.

## Setup steps

Run `schema_step18.sql` in the Supabase SQL editor.

## Follow-up — Asset picker on PM/CM reports now shows site + serial number

`app/reports/preventive-checklist/` and `app/reports/corrective-checklist/` — the Asset dropdown now matches the same `org — site · SN serial` format used on `/tickets/new` and `/work-orders/new` (Asset ID dropped), instead of just the asset tag. Both pages' Supabase queries were widened to pull `serial_number` and `sites(address)`.

## Follow-up — Site Visit Verification + wider report pages

**`components/site-visit-verification.tsx`** (new) — the reference's 4-tile "Site Visit Verification" block (GPS Check-In, Scan asset QR tag, Request customer confirmation, Photo Evidence), each a manual tap-to-toggle with a "N / 4 checks" badge that flips to "VERIFIED" once all four are on. Added to both `preventive-form.tsx` and `corrective-form.tsx`, positioned right after the report's top details section — same placement as the reference. Like the reference's own version, these aren't wired to real GPS/QR/camera hardware and aren't saved to the database; it's a visual sign-off aid, not a data field.

**Widened both report pages** — `/reports/preventive-checklist` and `/reports/corrective-checklist` no longer cap out at `max-w-3xl`/`max-w-2xl`; they now use the full content width like the reference does (no width cap in its own layout). Preventive's top details grid also goes up to 4 columns on wide screens instead of 2, to use the extra room instead of just leaving whitespace.

## Follow-up — unified "Comments & Sign-off" card, matching the reference layout

Both report forms now merge Comments, Performed By, Customer Signatory, and the two signatures into one card titled "Comments & Sign-off" — matching the reference's layout in the screenshot the user shared, instead of having Notes/Performed By and the signatures split across separate cards.

- `app/reports/preventive-checklist/preventive-form.tsx` — "Performed By" moved out of the top details grid and into this card; textarea placeholder changed to "Additional comments…" (was "Any additional summary…").
- `app/reports/corrective-checklist/corrective-form.tsx` — "Performed By" moved out of the Outcome card; added a Comments textarea (previously the Corrective report had no free-text comments field at all).
- `app/reports/actions.ts` — `createCorrectiveReport` now reads the new `notes` field and appends it to the saved findings as `Comments: …`, same as how Preventive already handled it.

Both Performed By fields now use the reference's placeholder text, "Service engineer / technician."

## Follow-up — Service Timing + If Failures Occurred added to both reports

Matched the reference's time-tracking block on both `/reports/preventive-checklist` and `/reports/corrective-checklist`:

- **Service Timing** — Time Arrived, Begin/Completed times ("Begin PM"/"PM Completed" on the Preventive form, "Service Begin"/"Service Completed" on Corrective — same fields, worded to fit each report type), and a manual visit Status (Completed/Pending).
- **If Failures Occurred** — Start Diagnostic, Diagnostic Done, Repair Starts, Repair Ends.

**`schema_step19.sql`** (new) — adds `time_arrived`, `service_begin`, `service_completed`, `visit_status`, `diagnostic_start`, `diagnostic_done`, `repair_start`, `repair_end` to `service_records` (shared by both report types, same table).

**`app/reports/actions.ts`** — both actions now save these via a shared `readServiceTiming()` helper, same pattern as `readSurveyAndSignOff()`.

## Setup steps

Run `schema_step19.sql` in the Supabase SQL editor.

## Follow-up — downloadable PDF for every submitted PM/CM report

**Implementation note — why this isn't a pre-generated file stored via a PDF library:** I checked, and no PDF-generation package (pdf-lib, jsPDF, @react-pdf/renderer, etc.) can be installed in this sandbox — `npm install` here is restricted to the packages already in `package.json` (confirmed: `npm install pdf-lib` returns a 403 from the registry, not a network failure). The same install would succeed on Vercel at deploy time, but I didn't want to ship an untested dependency + untestable PDF-drawing code for something this important (compliance paperwork) without being able to verify it actually renders correctly first.

Instead, built a printable report view that produces a real, downloadable PDF via the browser's native "Print → Save as PDF" — the same mechanism most invoicing/reporting SaaS tools use under the hood. Advantage over a pre-generated file: it always reflects the current stored data (can't go stale) and needed no Supabase Storage bucket setup.

**`app/reports/service-record/[id]/page.tsx`** (new) — standalone, non-AppShell printable report page (always white background — a dark UI theme doesn't print well, so this intentionally ignores the app's dark/light toggle). Renders: Pacific Horizon Tek letterhead (logo + report ref, e.g. `PM-A1B2C3D4`), report meta (customer, site, asset, equipment, serial, performed by, next due / downtime, outcome), the PM checklist table or CM parts-replaced table, findings/comments, Service Timing, If Failures Occurred, CSAT ratings, and the sign-off block with both signature images. A "Print / Save as PDF" button at the top (hidden when actually printing).

**`public/pacific-horizon-tek-logo.png`** (new) — the company logo you shared, used in the report header.

**`components/print-button.tsx`** (new) — thin client component wrapping `window.print()`.

**`lib/format.ts`** — added `reportRef(id, "PM" | "CM")`, same short-reference pattern as `ticketRef`/`woRef`.

**Where the download link lives:**
- Reports page → Preventive/Corrective Maintenance History cards → each row now has a "PDF" button.
- Right after submitting a report → the asset page's success banner now includes a "View / Download PDF" link (this banner existed before but its `report=submitted` param was never actually read — dead code — now wired up properly).

No new migration needed for this feature.

## Follow-up — true server-generated, permanently-stored PDF reports

Replaces the browser-print-to-PDF approach with what was actually asked for: a real PDF file is generated server-side the moment a PM/CM report is submitted, and stored in Supabase Storage — no more relying on the browser's print dialog.

**How, given no PDF library is installable here:** confirmed (again) that this sandbox's npm registry only allows packages already in `package.json` — installing anything new returns a 403, even though the same install would succeed on Vercel. Rather than add an untested dependency, I hand-wrote a minimal PDF writer and PNG decoder using only Node's built-in `zlib` — zero new dependencies, so there's no install-time risk at all (safer than adding pdf-lib would have been). This was fully tested in this sandbox using `qpdf --check`, `pdfinfo`, `pdftotext`, and `pdftoppm` (rendered to PNG and visually inspected) — including a 3-page report to confirm pagination and table-header-repeat-across-pages both work, and embedded PNG images (logo + signatures, including proper alpha-channel transparency via SMask).

**New files (`ams-web/lib/pdf/`):**
- `png.ts` — decodes 8-bit RGB/RGBA PNGs (chunks, zlib inflate, per-scanline unfiltering) into raw pixel planes.
- `writer.ts` — low-level PDF object writer: pages, the 2 standard fonts (Helvetica/Helvetica-Bold, no font embedding needed), filled/stroked rects and lines, and image XObjects (with SMask for transparency). Builds a spec-valid xref table and trailer.
- `text-metrics.ts` — approximate Helvetica glyph widths for safe word-wrapping.
- `service-report.ts` — the actual report layout: letterhead with logo, meta grid, checklist/parts table (paginates automatically, repeating the header row if it spans pages), findings paragraph, Service Timing / If Failures Occurred / CSAT blocks, and a sign-off block with both embedded signature images.
- `generate-and-store.ts` — glue: builds the PDF, uploads it to the `service-reports` bucket, and points `service_records.report_url` at it. Non-fatal on failure — the report itself always saves regardless.

**`schema_step20.sql`** (new) — creates the `service-reports` Storage bucket and its RLS policies via plain SQL (`storage.buckets`/`storage.objects` are just tables — no service-role key or dashboard click-through needed, same SQL-editor workflow as every other migration). Same read shape as `service_records` itself: staff see everything, a client_viewer only sees PDFs tied to their own org's assets.

**`app/api/reports/service-records/[id]/pdf/route.ts`** (new) — the actual download endpoint. Streams the stored PDF back with a proper filename (`PM-XXXXXXXX.pdf` / `CM-XXXXXXXX.pdf`). Falls back to the live HTML view for older reports that predate this feature (no stored PDF yet) instead of a dead link.

**Wiring:** both `createPreventiveReport` and `createCorrectiveReport` now call `generateAndStoreReportPdf()` right after the report (and its checklist items / parts) are saved. The Reports page's "PDF" buttons and the post-submit success banner's "Download PDF" link both now point at the new API route instead of the live-render page.

The live HTML print view (`/reports/service-record/[id]`, from the previous follow-up) is kept as a fallback and for quick viewing without downloading.

## Setup steps

Run `schema_step20.sql` in the Supabase SQL editor. Until it's run, reports will still save fine, but the success banner/Reports page will show an error noting the PDF couldn't be generated, and the "PDF" link will fall back to the live view.

## Verification note

`npx tsc --noEmit` passes clean across the whole project (this also caught and fixed one pre-existing, unrelated type error in `app/work-orders/new/page.tsx` that would have failed a production build). A full `next build` could not be completed in this sandbox — it hangs during static analysis, almost certainly because it tries to reach the live Supabase project at build time and this sandbox's network doesn't allow that (same restriction as the Nominatim geocoding calls earlier in this project). Worth running `npm run build` yourself once after pulling these changes, just to confirm a clean production build before deploying.

## Follow-up — report submission now redirects to the Reports tab

`app/reports/actions.ts` — both `createPreventiveReport` and `createCorrectiveReport` now redirect to `/reports?report=submitted&report_id=…` instead of back to the asset page. `app/reports/page.tsx` shows the same success banner (with a "Download PDF" link) that used to live on the asset page — removed that now-unreachable banner from `app/assets/[id]/page.tsx` to avoid leaving dead code behind.

## Follow-up — Report Logs show Site + Serial No. instead of Asset ID

`app/reports/page.tsx` — the Preventive/Corrective Maintenance History rows under "Exportable Report Logs" now show the site address + serial number (`NAIA Terminal 3, Pasay City · SN 88213`) instead of the asset tag, matching the same site/serial convention used elsewhere (Tickets, Work Orders, Assets). Widened the `service_records` query to pull `serial_number` and `sites(address)`.

## Follow-up — Work Order status now syncs onto its linked Ticket

`app/work-orders/actions.ts` — `updateWorkOrderStatus` now also updates the ticket this work order was created from (if any), mapping `work_order_status` straight onto `ticket_status`: Open → Open, In Progress → In Progress, Completed → Resolved (stamping `resolved_at` the first time that happens, same as the explicit Resolve action). Silently skipped if the work order isn't linked to a ticket, or if `schema_step16.sql` hasn't been run yet.

## Follow-up — unified ticket/work order status vocabulary + Work Orders filter bar

Tickets said "Resolved", work orders said "Completed" — two words for the same terminal state. `schema_step21.sql` renames both onto a shared vocabulary: **Open / In Progress / Parts Pending / Closed**, adding "Parts Pending" as a brand-new status on both `ticket_status` and `work_order_status` (for a job blocked waiting on a part). Run it once in the Supabase SQL editor after `schema.sql` and `schema_step9.sql`.

Because `work_order_status` and `ticket_status` are now the exact same 4 values, `updateWorkOrderStatus` (`app/work-orders/actions.ts`) no longer needs a mapping table — the status just passes straight through onto the linked ticket. The separate `calendar_events.status` enum (still `scheduled`/`completed`/`overdue`) and `inventory_cycles.status` (still `completed`) were deliberately left untouched — only ticket/work-order statuses were renamed.

Other changes:
- `app/assets/tickets-actions.ts` — new `markTicketPartsPending` action; `resolveTicket` now writes `"closed"` instead of `"resolved"`.
- `app/assets/[id]/page.tsx` — ticket rows on the Asset page now show a "Mark Parts Pending" button alongside "Start Progress" / "Mark Closed" (renamed from "Mark Resolved").
- `app/tickets/page.tsx`, `app/work-orders/new/page.tsx`, `app/dashboard/page.tsx`, `app/reports/page.tsx` — every `"resolved"` status check/label updated to `"closed"` (dashboard also adds a Parts Pending KPI count so "active tickets" isn't undercounted).
- `components/status-badge.tsx` — `STATUS_MAP` gained `closed` and `parts_pending` entries; the old `completed` entry stays as-is since calendar/inventory statuses still use it.
- `app/work-orders/work-orders-table.tsx` — status dropdown is now Open / In Progress / Parts Pending / Closed. The filter bar above the table changed from All Open/High Priority/In Progress/Completed to **All / Open / In Progress / Parts Pending / Closed / High Priority**, defaulting to **All** — previously the default filter hid completed work orders entirely, which is why they looked like they'd disappeared after being closed. They're still in the table now; just filter to "Closed" to see only those.

Verified with a full `npx tsc --noEmit` (clean). `next build` still can't complete in this sandbox for the same live-Supabase-network reason noted above — same "run it yourself before deploying" caveat applies.

## Follow-up — 3-tier roles: Super Admin / Admin / Client

The flat `internal_staff`/`client_viewer` split is now three tiers: **Super Admin**, **Admin**, **Client**. Admin sees every tab Super Admin does, except Audit Log, which is Super Admin-only.

Run these three files as three SEPARATE runs, in order, each one finishing/committing before the next starts:

1. **`schema_step22.sql`** — renames `internal_staff` → `admin` on the `user_role` enum (every existing staff profile carries over automatically) and adds a brand-new `super_admin` value.
2. **`schema_step22b.sql`** — updates `is_internal_staff()` (the helper every existing staff-only RLS policy across the whole project already calls) to mean "admin OR super_admin," so none of those other policies needed to change, plus a new `is_super_admin()` helper that gates just the Audit Log table's RLS policy. This has to be a separate file/run from Step 22 — Postgres raises `55P04: unsafe use of new value` if a brand-new enum value is referenced (even just inside a function body being defined) before the `ALTER TYPE` that added it has actually committed. Pasting both as one script hits that error.
3. **`schema_step23.sql`** — assigns the three accounts: `lal@phtek.com.ph` → Super Admin, `gsc@phtek.com.ph` → Admin (inserts the `profiles` row if it doesn't exist yet — the Supabase Auth user has to already exist first), `client@horizoncare360.com` → unchanged (`client_viewer`).

App side: `lib/supabase/profile.ts` gained `isStaffRole()`/`isSuperAdminRole()` helpers and a `requireSuperAdmin()` guard (mirroring `requireStaff()`). Every inline `profile?.role === "internal_staff"` check across the app (`reports/page.tsx`, `calendar/page.tsx`, `assets/page.tsx`, `assets/[id]/page.tsx`, `dashboard/page.tsx`, `fleet-map/page.tsx`, `components/sidebar.tsx`) now goes through `isStaffRole()` instead. `app/audit-log/page.tsx` swapped `requireStaff()` for `requireSuperAdmin()`. The sidebar nav gained a `superAdminOnly` flag (only set on the Audit Log item) alongside the existing `staffOnly` flag, and the account badge at the bottom now reads "Super Admin" / "Admin" / "Client" instead of just "Staff" / "Client".

Verified with a full `npx tsc --noEmit` (clean).

## Follow-up — client component was importing server-only code

`components/sidebar.tsx` (a `"use client"` component) had started importing `isStaffRole`/`isSuperAdminRole` directly from `lib/supabase/profile.ts`, which transitively imports `next/headers` via `./server` — that broke local dev with "You're importing a component that needs next/headers." Split the pure role-check functions out into a new `lib/supabase/roles.ts` with zero server-only imports; `profile.ts` now re-exports them for server components, and `sidebar.tsx` imports directly from `roles.ts` instead.

## Follow-up — client account showed no data; Tickets tab was fully staff-gated

Two separate issues, both needed for a `client_viewer` to see their fleet's data:

1. **Data scoping.** `schema_step24.sql` upserts `client@horizoncare360.com`'s `profiles` row with `organization_id` pointing at the "Bureau of Customs" organization. Every RLS policy in this project already enforces "only your own org" via `my_organization_id()` (which just reads this column) — nothing showing up was a sign the column was never set, not a missing policy. Run the SELECT at the top of that file first to confirm the exact org id/name before the upsert runs.
2. **Tickets tab was 100% staff-gated.** Unlike Dashboard/Assets/Reports (client-visible, RLS-scoped), the Tickets page had `requireStaff()` on it and `staffOnly: true` in the sidebar nav — a client_viewer literally couldn't reach `/tickets` at all. Opened it up: `app/tickets/page.tsx` no longer redirects non-staff (RLS's existing "read own org tickets or all if staff" policy already scopes the query correctly with zero extra filtering needed), `components/sidebar.tsx` dropped `staffOnly` from the Tickets nav item, and `app/tickets/tickets-table.tsx` now takes an `isStaff` prop to hide the staff-only "+ Create work order" link and the "+ Request New Service" button from clients (they already have an equivalent path via the "Raise a Service Request" form on each Asset's detail page).

Reports and Dashboard needed no code changes — they were already client-visible and RLS-scoped; they were just as empty as everything else purely because of the missing `organization_id`.

Verified with a full `npx tsc --noEmit` (clean).

## Follow-up — richer client Dashboard: SLA Performance + Active Tickets now client-visible

The client Dashboard only had the top KPI row plus Service Due/Certs Expiring — everything in between (Active Support Tickets, SLA Performance, SLA Historical Performance, Equipment Health, Quick Action Center, Recent Activity) was `isStaff`-gated as one block. `app/dashboard/page.tsx` now splits that gate per-widget instead of all-or-nothing:

- **Active Support Tickets** and **SLA Performance** (the requested SLA % front and center) are now client-visible — the underlying queries were already computed unconditionally and already RLS-scoped to the signed-in org, so this was a pure JSX change, no data-layer risk.
- **SLA Historical Performance** (the 5-week trend chart) is client-visible too, giving the raw SLA % some context over time. Goes full-width instead of 2/3-width when Equipment Health and Recent Activity aren't there to fill the rest of the row.
- **Equipment Health** stays staff-only — it just repeats numbers already on the top KPI row, not worth duplicating for a client.
- **Quick Action Center** stays staff-only — its "Request New Service" button links to the staff-only global ticket form; clients already have an equivalent path via "Raise a Service Request" on each Asset's page.
- **Recent Activity** stays staff-only — it reads the audit trail, which `schema_step22b.sql` restricted to Super Admin, and isn't something appropriate to show an external client regardless.

Title/subtitle also flex by role now: staff still see "Operations Control Center," clients see "Fleet Overview" with a subtitle about their own fleet instead of the staff-facing "across clients" phrasing.

Verified with a full `npx tsc --noEmit` (clean).

## Follow-up — mobile responsiveness (shell, tables, forms)

Before starting the chat/video-call feature, an audit found the app effectively unusable on a phone: the sidebar was a hard-coded 260px block with no collapse mechanism (eating ~70% of a 375px screen on every page, with no way to dismiss it), every data table used `overflow-hidden` instead of a scroll wrapper (so the whole page dragged into horizontal scroll instead of just the table), and a few forms used fixed 2-column grids with no mobile collapse. Fixed all three:

1. **Sidebar is now a proper off-canvas drawer below the `lg` breakpoint.** New `components/mobile-nav.tsx` holds a small React context (`open`/`setOpen`) so the hamburger button (now in `Topbar`) and the drawer (`Sidebar`) — two separate sibling components under `AppShell` — can share one piece of state without prop-drilling it through every page. `Sidebar` is `fixed` + translated off-screen by default on mobile, slides in with a dark backdrop when opened, gained a close (X) button, and auto-closes on route change (`useEffect` on `pathname`). At `lg` and up it switches back to `sticky` and sits inline in the flex layout exactly as before — desktop is visually unchanged. `AppShell`'s content column got `min-w-0` added (without it, a flex child can't shrink below its content's intrinsic width, which would silently defeat the table scroll fix below) and `main`'s padding is now `p-4 sm:p-6 lg:p-8` instead of a flat `p-8`.
2. **Every data table now scrolls horizontally instead of squeezing or dragging the whole page.** Changed the wrapper `<div>` around every `<table>` from `overflow-hidden` to `overflow-x-auto` across `assets/page.tsx`, `inspections/page.tsx`, `work-orders/work-orders-table.tsx`, `tickets/tickets-table.tsx`, `audit-log/page.tsx`, `inventory/page.tsx`, `inventory/[id]/page.tsx`, `clients/clients-table.tsx`, `reports/page.tsx` (Recent Service Tickets), and added new scroll wrappers around the two tables in the printable `reports/service-record/[id]/page.tsx` view (which had none at all). Left `overflow-hidden` alone everywhere it's wrapping a card/panel rather than a table (notification bell dropdown, calendar panels, checklist group cards, alert cards) — those are correctly clipping rounded corners, not something that needs to scroll.
3. **Fixed-2-column forms now collapse to one column below `sm`.** `grid grid-cols-2 gap-4` → `grid grid-cols-1 gap-4 sm:grid-cols-2` in `assets/asset-form.tsx` (6 instances), `work-orders/new/page.tsx`, `reports/corrective-checklist/corrective-form.tsx`, `alerts/new/page.tsx`, and `calendar/new/page.tsx`.

Verified with a full `npx tsc --noEmit` (clean). Couldn't verify visually in this sandbox — `next dev`/`next build` both hang here for the same reason noted earlier in this changelog (reaching the live Supabase project over a network this sandbox blocks). Please pull these changes and check a few pages at a phone width (or your browser's device toolbar) before we start on chat/video-calling — the sidebar drawer in particular is the kind of thing worth eyeballing once for real before building more UI on top of it.

## Follow-up — Messages: chat + voice/video calling, scoped to a ticket

Built the long-deferred chat/calling feature (task list item since early in the project). Client ↔ staff, one conversation per ticket — a ticket already is the unit of work everything else (status, priority, SLA) hangs off, so there's no separate "conversation" record, just `messages` rows filtered by `ticket_id`.

**Architecture — zero new npm dependencies:**
- **Text chat** runs entirely on Supabase (already in the stack): a `messages` table (`schema_step25.sql`) + Supabase Realtime `postgres_changes` for live delivery.
- **Voice/video calls** use the browser's native WebRTC (`RTCPeerConnection`/`getUserMedia`, built into every modern browser including mobile Safari/Chrome — no SDK). The call *signaling* (offer/answer/ICE candidates, ringing/hangup) travels over a Supabase Realtime **Broadcast** channel per ticket (`call:${ticketId}`) — ephemeral, nothing persisted. The actual audio/video is a direct peer-to-peer connection between the two browsers and never touches Supabase.
- **TURN relay**: the one piece that can't come from Supabase — WebRTC needs a relay server for calls to reliably connect over mobile/cellular data and behind strict firewalls (direct peer-to-peer alone works fine on wifi but frequently fails on carrier networks). Wired up [Metered.ca's TURN Server Service](https://www.metered.ca/stun-turn) (free tier, 500MB/month, no card required) via a server-side proxy route so the API key never reaches the browser.

**New files:**
- `schema_step25.sql` — `messages` table (`ticket_id`, `sender_id`, `message_type` covering both real text AND call *events* — `call_started`/`call_ended`/`call_missed`/`call_declined` — so the call history shows up inline in the same feed as text, one timeline instead of two UIs), RLS mirroring the exact same "staff manage everything, client reads/writes only their own org's tickets" pattern already used for `service_tickets`, and adds `messages` to the `supabase_realtime` publication (required for `postgres_changes` subscriptions to fire at all on a new table).
- `app/api/turn-credentials/route.ts` — auth-gated server route that fetches short-lived ICE server credentials from Metered using `METERED_APP_NAME`/`METERED_API_KEY` env vars. Falls back to a public STUN-only server (same-network calls still work, just not reliably over mobile/behind firewalls) if those env vars aren't set yet, or if Metered has a transient outage — never hard-blocks the feature.
- `lib/webrtc/use-call.ts` — the call state machine as a React hook (`idle → calling/ringing → connecting → active`), handling the full signaling handshake, ICE candidate buffering (for candidates that arrive before the remote description is set), a 45-second ring timeout that logs a missed call, mute/camera toggles, and cleanup on unmount (hangs up if you navigate away mid-call).
- `app/messages/page.tsx` — inbox-style list of every ticket the signed-in user can access (RLS-scoped), sorted by most recent activity, with a one-line preview of the latest message or call event.
- `app/messages/[ticketId]/page.tsx` + `ticket-chat.tsx` — the actual thread: scrolling message list (call events render as centered pills, text as left/right bubbles), a composer, voice/video call buttons, an incoming-call banner with Accept/Decline, and a full call overlay (remote video full-size + local video PIP for video calls, avatar + controls for audio-only) with mute/camera/hang-up controls sized for touch. `<video>` elements use `playsInline` (without it, iOS Safari forces its own fullscreen player instead of an in-page video).
- `components/mobile-nav.tsx`'s sidebar entry: repurposed the long-disabled "HorizonCare360 Assist" placeholder into "Messages" — enabled, no longer staff-only.

**Entry points**: a "Message" link on every row in the Tickets table, and a "Message about this ticket →" link on each ticket in the Asset detail page's Service Tickets section (both client- and staff-visible, unlike the staff-only ticket action buttons next to it).

**Known v1 simplifications** (fine for a small team, worth knowing about): no read receipts or unread-count badges; if two staff members both try to accept the same incoming call, only the first "answer" the caller receives wins (no explicit conflict handling); no call duration shown in the log (just start/end/missed/declined events with timestamps); RLS on `messages` INSERT scopes by ticket/org but doesn't independently verify `sender_id` matches the authenticated user, matching the same lighter-touch convention already used by `service_tickets`' own insert policy elsewhere in this project (RLS's real boundary here is organizational scoping).

**Still needed before calling works reliably on mobile:**
1. Run `schema_step25.sql` in the Supabase SQL editor.
2. Sign up at [dashboard.metered.ca/signup](https://dashboard.metered.ca/signup) for the free TURN Server Service plan, then add `METERED_APP_NAME` and `METERED_API_KEY` to both `.env.local` (already has placeholders with instructions) and your Vercel project's environment variables.

Text chat works right now with neither of those — only calling needs them, and even calling will work on same-wifi testing without Metered credentials, just not reliably over cellular.

Verified with a full `npx tsc --noEmit` (clean). Not visually tested in this sandbox for the same Supabase-network reason as everything else in this changelog — please try it out (a text message between a staff and client account, then a voice/video call) once the migration is run.

## Follow-up — sound effects + fixed a real Accept-call bug

Real-device testing (staff on a Mac calling a client's phone) surfaced an actual bug: tapping Accept on the phone resulted in "Voice call declined" showing up on the caller's side instead of connecting.

**Root cause**: `acceptCall()` in `lib/webrtc/use-call.ts` wraps `getUserMedia`/`RTCPeerConnection` setup in a try/catch — and the catch block's job is to gracefully tell the caller "this device can't take the call" by sending a `decline` signal. That's correct behavior when it's genuinely needed, but the catch block was swallowing the *real* underlying browser error and always showing the same generic "check your permissions" message — so there was no way to tell whether it was a denied mic permission, no available device, the browser blocking `getUserMedia` in some restricted context, or something else. Fixed the error handling to capture and surface the actual `err.name`/`err.message` (also logged to the console) — next time this happens, whatever's shown in the red error banner will say exactly what failed.

Also fixed a real race condition while in there: a fast double-tap on the Accept button (easy to do on a touchscreen) could fire `acceptCall()` twice concurrently, each creating its own `RTCPeerConnection` and overwriting the other's reference mid-setup — a very plausible way to end up in a broken state that looks like a spurious decline. Added a guard (`acceptingRef`) so only the first tap's run actually executes.

**Sound effects** (`lib/sounds.ts`, new) — synthesized with the Web Audio API (a few oscillator beeps), not audio files, so this needed no new dependencies or licensed assets:
- A short two-note "pop" plays right after you send a chat message.
- A repeating two-tone ringtone plays for the callee while a call is incoming, until accepted/declined/the caller hangs up.
- A repeating ringback tone plays for the caller while waiting for the other side to pick up.

One real constraint worth knowing: browsers (especially mobile) block any audio — including a ringtone triggered by an incoming call, which isn't a direct tap/click — until the page has seen at least one real user gesture. `unlockAudioOnFirstInteraction()` primes the shared `AudioContext` on the first tap/click/keypress after the Messages thread mounts, so by the time an actual call comes in, the ringtone isn't silently blocked. Simply having opened the ticket's chat is enough — no separate "enable sound" step needed.

Verified with a full `npx tsc --noEmit` (clean). Please retest the same call scenario — if it still fails, the error banner should now show the actual browser error message; send that over and I can fix the real cause instead of guessing at it.

## Follow-up — fixed `crypto.randomUUID is not a function` on mobile dev testing

The improved error surfacing above immediately paid off: real-device testing on the phone hit `TypeError: crypto.randomUUID is not a function` in `lib/webrtc/use-call.ts` when starting a call. This is exactly why "surface the real error" was worth doing — the underlying browser API `crypto.randomUUID()` only exists in a "secure context" (HTTPS, or `localhost`), so it's silently undefined on a phone browser reached over plain `http://<lan-ip>:3000` — the normal way to test a local dev server from another device on the same wifi. It'll always work fine on the deployed Vercel site (which is HTTPS), but not for this style of local-network testing.

Fixed by adding a small fallback ID generator (`makeCallId()`) that uses `crypto.randomUUID()` when available and otherwise builds an equally-unique-enough ID from a timestamp + random string — no crypto strength needed here, it's just a call identifier. Verified with a full `npx tsc --noEmit` (clean).

## Follow-up — clearer error for camera/mic access over plain HTTP

Same root cause as above, different symptom: after the `randomUUID` fix, testing on the phone hit `Cannot read properties of undefined (reading 'getUserMedia')`. `navigator.mediaDevices` itself is only exposed in a secure context (HTTPS, or `localhost` on the same device) — over plain `http://<lan-ip>:3000` the browser doesn't throw a permission error, it just doesn't expose the API at all, which is why the error looked like an internal bug rather than a permissions issue.

This one isn't fixable in code — camera/mic access over plain HTTP from another device is a hard browser security restriction, not a bug. Added an upfront check in `getLocalMedia()` (`lib/webrtc/use-call.ts`) so it now fails with a clear message ("Camera/microphone access requires HTTPS...") instead of a confusing stack trace. **Practical takeaway: chat/calling needs to be tested on the deployed Vercel site (HTTPS) from here on, not the local dev server reached from a phone.** Everything else in the app is unaffected — regular pages work fine either way.

## Follow-up — chat/calling housekeeping round (close button, rename, unread state, mobile call banner)

With calling confirmed working end-to-end, five polish items:

1. **Close button in the chat card.** Added an X button in the conversation toolbar (`ticket-chat.tsx`) that returns to the inbox — same destination as the existing "← Back" link in the page header, just also reachable from inside the card itself.

2. **Renamed the nav item.** "Messages" is now "HorizonCare360 Assist" throughout — the sidebar link, the inbox page title, and the ticket URL structure (`/messages/...`) is unchanged since renaming routes isn't necessary for this and would just add risk.

3. **Received-message tone.** Added `playReceivedTone()` (`lib/sounds.ts`) — same synthesis approach as the sent tone, but the two notes fall instead of rise, so sent vs. received are distinguishable by ear alone. Plays whenever a text message arrives from someone else while the thread is open.

4. **Unread indicator — bell dot + inbox "New" badges.** This needed real state, not just a UI tweak:
   - New table `message_reads` (`schema_step26.sql` — **needs to be run in the Supabase SQL editor**, same as every other schema_step file): one row per (user, ticket) recording when that user last saw the thread. RLS: a user can only read/write their own rows.
   - `ticket-chat.tsx` upserts its own `message_reads` row the moment a thread opens, and again every time a new inbound message arrives while it's open — so a ticket you're actively looking at never shows as unread.
   - A shared pure function (`lib/messages/unread.ts`, no Supabase import so it works identically server- and client-side) compares each ticket's newest inbound message against that read state to decide "unread or not."
   - `components/messages-unread-dot.tsx` (new, sidebar-only) shows a small red dot on the "HorizonCare360 Assist" nav item whenever anything is unread, and listens live via Realtime so it lights up immediately on a new message, not just on next page load.
   - The `/messages` inbox list now shows a red "New" badge and a bold preview line on any ticket with unread messages.
   - Note: while wiring this up I found `components/notification-bell.tsx` was already taken by the unrelated Alerts bell on the dashboard — kept that file untouched and put the new one under its own name to avoid clashing with it.

5. **Mobile: Accept/Decline weren't reachable without scrolling.** The incoming-call banner used to be the first element inside the chat card — reasonable in theory, but on a phone the page header (title, subtitle, back link) pushed the card far enough down that the banner started below the fold. Changed it to a `position: fixed` bar pinned to the very top of the viewport (with iOS safe-area padding for the notch), so Accept/Decline are visible the instant a call comes in, regardless of scroll position or how tall anything above it is.

Verified with a full `npx tsc --noEmit` (clean). **`schema_step26.sql` needs to be run in Supabase before the unread dot/badges will work** — everything else (close button, rename, received tone, fixed call banner) works as soon as it's deployed.

## Follow-up — client self-service ticket requests + equipment alerts

Turns out the hard part of client-side ticket requests already existed: `service_tickets` has had a `"clients can raise tickets on own assets"` RLS insert policy since early on (schema.sql), and there was already an ungated "Raise a Service Request" form buried at the bottom of each asset's detail page. What was missing was a proper, visible entry point — the global "Request New Service" form (`/tickets/new`) and its quick-action links were all `requireStaff()`-gated for no data reason, just an oversight from when it was first built staff-first.

Fixed by removing that gate — `/tickets/new` and its server action (`createGlobalTicket`, `app/assets/tickets-actions.ts`) are now open to clients, with RLS as the actual security boundary (a client can only ever create a ticket against their own org's assets, even if the submitted asset_id were tampered with — the database rejects it, not just the UI). Added two visible entry points for clients specifically:
- **Tickets tab**: the "+ Request New Service" button, previously staff-only, now shows for everyone.
- **Dashboard**: a "+ Request Service" button next to the search bar (client view only).

Also added an **Equipment Needing Attention** card to the client dashboard — this is new, not just un-gating: it reads directly from each client's own assets (RLS-scoped) for anything in Down or Attention status, so a client can see at a glance which of their machines needs a look, with a link straight to that asset's page (and from there, straight into raising a ticket or opening the chat). This is separate from the staff `alerts` table (manually raised internal triage alerts) — deliberately kept simple by deriving from asset status directly rather than building a parallel alerting pipeline.

While in the dashboard's Quick Action Center, also swapped the stale "Start Live Call — Coming soon" placeholder (from before chat/calling existed) for a real link into `/messages`.

Verified with a full `npx tsc --noEmit` (clean).

## Follow-up — file/photo attachments in chat

Any participant on a ticket's thread — super admin, admin, or client — can now attach a document or photo to a message, with or without a caption. Same component for everyone (`ticket-chat.tsx`), so no role-specific work was needed beyond building it once.

**Schema (`schema_step27.sql` — needs to be run in Supabase):**
- Four new nullable columns on `messages`: `attachment_path`, `attachment_name`, `attachment_mime`, `attachment_size`. A message can carry a caption, an attachment, or both — no new table needed.
- New private Storage bucket `chat-attachments`, same pattern as the existing `service-reports` bucket (schema_step20.sql): staff get full access, everyone else is scoped to their own org. The scoping check here is a path-prefix check rather than a table join, because the uploaded file has to land in Storage *before* the `messages` row referencing it can be inserted — there's nothing to join against yet at upload time. Every object is stored at `{ticket_id}/{random}-{filename}`, and the RLS policies read the ticket id straight off that path.

**Upload/display (`ticket-chat.tsx`, new `lib/attachments.ts`):**
- A paperclip button next to the message box opens the device's native file/photo picker (`image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt`) — on mobile this naturally offers the camera as one of the options, no extra work needed.
- Picked files show as a removable chip above the composer before sending; a 20MB cap is enforced client-side with a clear error if exceeded.
- Everything happens directly from the browser (upload to Storage, then the message insert) — same pattern the rest of chat already uses, with Storage's RLS as the real access boundary rather than a server route.
- In the thread, images render as an inline preview (tap to open full-size); anything else renders as a filename + size chip that opens/downloads in a new tab. Both use short-lived signed URLs generated on render, not the private object path directly.
- The inbox list's preview line now shows "📎 Photo" or "📎 filename.pdf" for the latest message when it's attachment-only (no caption), instead of a blank line.
- Received-message tone and the unread dot/badge both already keyed off "any inbound text-type message" (previous follow-up), so attachment messages trigger them automatically — no extra wiring needed there.

Verified with a full `npx tsc --noEmit` (clean). **`schema_step27.sql` needs to be run in Supabase before attachments will work** (same as `schema_step26.sql`, if that hasn't been run yet either).

## Follow-up — 10-item usability pass (asset popup, timestamps, ticket detail view, and more)

`schema_step28.sql` — **run this in Supabase before any of the below.** Adds: `work_orders.closed_at`; `service_records.ticket_id` (lets a PM/CM report be tied to the ticket that prompted it); adds `service_tickets` to the realtime publication (live status sync); and a `profiles` policy letting any signed-in user read a STAFF profile's name specifically (needed for the chat sender-name change below — doesn't expose client profiles to each other).

1. **Asset detail popup.** Clicking a row on the Assets tab now opens a summary modal (site/location, install date, next PM date, warranty end, status, latest ticket) instead of navigating away — X closes it back to the list. Built as `?asset=<id>` on the Assets URL rather than local-only state, specifically so it's linkable.

2. **Fleet Map → Assets popup.** The map's site popup button (previously "View client", going to the staff-only client page) now opens that exact same asset popup via the `?asset=` link — works for clients too, who couldn't reach the old destination anyway.

3. **Ticket raised/resolved timestamps.** Tickets now show date *and* time (not just date) everywhere they appear — the Tickets table, the ticket detail modal (below), and the asset page's ticket list, which also now shows a Resolved timestamp once one exists.

4. **Work order created/closed timestamps.** Same idea — Work Orders table gained Created and Closed columns. Closed didn't exist as a concept before; `closed_at` is stamped the first time a work order reaches "closed" and never overwritten after (so reopening/reclosing doesn't lose the original close time).

5. **Site + serial instead of the internal asset code.** Replaced the asset_tag ("AST-0004"-style internal code) with "Site — SN Serial" wherever an asset is the primary thing being identified in a list: the Dashboard's three asset widgets, Calendar, Alerts, and the Clients detail page's asset list. The Assets table itself now leads with Serial Number (Site already has its own column there, so repeating it would be redundant).

6. **Filters on the Assets tab.** Same pill-filter pattern as Tickets/Work Orders, now on Assets too (All / Operational / Attention / Down / Unserviceable) — for both staff and clients.

7. **HorizonCare360 Assist inbox timestamps.** Each conversation row now shows both when it started (the ticket's created_at) and when it was last updated (the latest message), not just a single date.

8. **Chat header + real staff names for clients.** The toolbar label ("Conversation") is now the ticket ID, site, and serial number. And — this needed the new profiles RLS policy above — a client now sees "Tech Support — Jane Dela Cruz" instead of a generic "Support" for staff replies, while staff still see a client's real name as before.

9. **Calendar entry summary popup.** Clicking any entry (month grid or the Upcoming list) opens a small summary — status (using the real Open/In Progress/Parts Pending/Closed vocabulary when the entry is tied to an actual work order, falling back to the calendar's own scheduled/completed/overdue otherwise), type, date, site/equipment, lead technician, and notes.

10. **Ticket detail view for staff, with status changes and a linked PM/CM report.** Clicking a ticket row (Super Admin/Admin only — clients keep the old asset-page link) opens a detail modal: full description, a status dropdown that calls a new `updateTicketStatus` action, raised/resolved timestamps, and a "PM / CM Report" section that shows the report if one's been logged for this ticket, or links to log one if not. Per your note during scoping, rather than a raw file-upload button in the modal, the PM/CM report forms themselves (`/reports/preventive-checklist`, `/reports/corrective-checklist`) gained a "Related Service Ticket" selector (or an auto-filled banner when arriving via a link from the ticket modal) — so the report generation flow is the one place a report ever gets tied to a ticket, same as it's already the one place a report gets tied to an asset. Status changes go out over Realtime, so **a client sitting on their own Tickets page sees the status update live**, without refreshing — same mechanism chat messages already use.

Verified with a full `npx tsc --noEmit` (clean) across every file touched. Not visually tested in this sandbox (same standing limitation as everything else chat/realtime-related) — please run `schema_step28.sql` first, then push and try each of the 10 through their real flows.

## Follow-up — fixed PDF generation on Vercel (logo file not found)

Real-world testing surfaced a production-only bug: submitting a CM report saved fine, but the PDF step failed with `ENOENT: no such file or directory, open '/var/task/ams-web/public/pacific-horizon-tek-logo.png'`. The "(have you run schema_step20.sql?)" part of that message was a red herring — nothing to do with the database.

**Root cause**: `lib/pdf/generate-and-store.ts` loaded the report header logo with `fs.readFileSync(path.join(process.cwd(), "public", "pacific-horizon-tek-logo.png"))`. That works fine in local dev (`npm run dev`) because the whole project folder is right there on disk — but Vercel's serverless functions each get their own minimal filesystem bundle, and **`/public` isn't included in it** (Next.js serves `/public` straight from its CDN instead, never expecting server code to read those files back off disk at request time). So the exact same code path that worked every time locally was guaranteed to fail on every single PDF generation in production — this wasn't a flaky bug, it just hadn't been hit by real-device testing yet.

**Fix**: the logo is now embedded directly in the code as a base64 string (`lib/pdf/logo-base64.ts`, auto-generated from the PNG, verified byte-for-byte identical via a SHA-256 round-trip check) and decoded with `Buffer.from(..., "base64")` instead of read from disk. This has zero filesystem dependency, so it works identically in local dev, Vercel, or anywhere else — no Next.js config or deployment-specific tracing rules to get right or accidentally break later. Grepped the rest of the codebase for the same `readFileSync`/`process.cwd()` pattern — this was the only occurrence.

Verified with `npx tsc --noEmit` (clean). No schema changes, no migration needed — just push and the next report submission should generate its PDF successfully.

## Follow-up — moved Quick Action Center from staff to client dashboard

Per your call after seeing the Super Admin dashboard: staff already have the full sidebar (Tickets, Work Orders) to create things directly, so a dashboard shortcut card was redundant for them — and clients, who are the ones actually requesting support, didn't have an equivalent. Swapped which role sees it (`app/dashboard/page.tsx`) — no changes needed inside the card itself, since "Request New Service," "Open Support Ticket," and "Chat / Start Live Call" already point to pages clients can use (from earlier follow-ups). Both roles now land on 3 cards in that row either way, so the grid simplified to a flat 3-column layout instead of switching between 2 and 4 by role.

Verified with `npx tsc --noEmit` (clean). No schema changes.

## Follow-up — Automated PM ticket generation

First item off the improvements list: instead of relying on someone remembering to check `next_service_due`, a daily job now does it automatically.

**`schema_step29.sql`** (new) — **run this in Supabase before deploying.** Two additions:
- `calendar_events.ticket_id` — lets an auto-generated calendar event point back to the ticket that prompted it (closes a gap: calendar events already linked to work orders, but not to tickets).
- `pm_auto_runs` — a new bookkeeping table, one row per (asset, due date) the job has already acted on. This is what actually prevents duplicate tickets if the job runs twice for the same day (retry, manual re-trigger) — the `unique(asset_id, due_date)` constraint enforces it at the database level, not just in app logic. Staff-readable, but nothing writes to it except the job itself.

**How it works (`lib/pm-automation.ts`):** once a day, checks every asset whose `next_service_due` falls within a lead window (default 7 days, configurable — see below), skips any it's already handled (via `pm_auto_runs`), and for everything left, creates: a service ticket (marked high priority if already overdue, medium if upcoming), a calendar event on the due date linked to that ticket, and a caution-level alert — the same three things a staff member would otherwise create by hand. Assets already marked `unserviceable` are skipped (nothing to schedule PM for on retired equipment).

**Running it (`app/api/cron/pm-due/route.ts`):** wired to Vercel Cron (`vercel.json`, daily at 01:00 UTC / 9am PH time) via a `CRON_SECRET` bearer token — the standard pattern for authenticating a cron job that has no user session to check RLS against. Also callable manually by a signed-in Super Admin (same URL, just visit it while logged in) for demos or testing without waiting for the scheduled run.

**New environment variables — set these in `.env.local` and in Vercel's Project Settings → Environment Variables:**
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard → Project Settings → API. Needed because the cron job has no logged-in user, so it can't go through the usual cookie-session client; this one bypasses RLS entirely (`lib/supabase/service-role.ts`), so it's server-only and must never reach the browser.
- `CRON_SECRET` — any random string (e.g. `openssl rand -hex 32`), must match on both sides.
- `PM_REMINDER_LEAD_DAYS` — optional, defaults to 7 if unset.

**Scope note:** the "heads-up notification" is the existing in-app Alerts feed, not email — a real email notification would be a separate follow-up if you want it.

Verified with `npx tsc --noEmit` (clean).

## Setup steps

1. Run `schema_step29.sql` in Supabase.
2. Add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` to `.env.local` (copy the new lines from `.env.local.example`) and to Vercel's environment variables.
3. Push to GitHub — Vercel will pick up `vercel.json` and register the daily cron automatically (visible under the project's Cron Jobs tab once deployed).
4. To test without waiting a day: set an existing asset's `next_service_due` to a date within the next 7 days (or in the past), sign in as Super Admin, and visit `/api/cron/pm-due` directly in the browser. Confirm a new ticket, calendar event, and alert appear for that asset, then reload the same URL and confirm it does *not* create duplicates the second time.

## Follow-up — SLA breach escalation

Second item off the improvements list: tickets now get proactively flagged as they approach or blow through their SLA window, instead of only showing up as a bad number on the dashboard after the fact.

**`schema_step30.sql`** (new) — **run this in Supabase before deploying.** One addition: `sla_escalations`, the same idempotency/audit-ledger pattern as `pm_auto_runs` — one row per (ticket, event) already escalated, so re-running the check never double-fires the same alert or re-bumps priority. A ticket can accumulate up to 4 rows over its life (response approaching → response breached, resolution approaching → resolution breached), each firing exactly once.

**How it works (`lib/sla-escalation.ts`, targets now shared via `lib/sla.ts`):** once a day, checks every ticket that isn't closed against the same two SLA targets the dashboard already uses (8h first response, 48h resolution — `lib/sla.ts` is now the single source for both, so they can't drift apart). Each ticket is checked on two independent dimensions:
- **Response** — only while nobody's responded yet (`first_response_at` still null).
- **Resolution** — any ticket still open, regardless of response state.

For each dimension, hitting 80% of the target with no `sla_escalations` row yet raises a **caution** alert ("approaching," no other change). Hitting 100% raises a **critical** alert and bumps the ticket's priority to **High** if it wasn't already — so an overdue ticket actually surfaces higher in every priority-sorted view instead of quietly sitting at whatever priority it was raised with.

**Running it (`app/api/cron/sla-check/route.ts`):** same dual-auth pattern as the PM job — Vercel Cron via `CRON_SECRET`, or a signed-in Super Admin visiting the URL directly for demos/testing. No new environment variables needed; reuses `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` from the PM automation follow-up above.

**Known limitation, not a bug:** Vercel's Hobby plan caps cron jobs at once per day. An 8-hour response SLA checked once every ~24h means a breach might not get flagged until close to a day after it actually happened — a real gap between "proactive" and "instant." Two ways to close it if it matters before a Pro upgrade: point an external scheduler (e.g. cron-job.org, GitHub Actions on a schedule) at `/api/cron/sla-check` with the `CRON_SECRET` header on whatever cadence you want (hourly, say) — no code change needed, the route doesn't care who calls it as long as the secret matches. Otherwise, upgrading the Vercel project to Pro lifts the once-daily cap directly.

Verified with `npx tsc --noEmit` (clean).

## Setup steps

1. Run `schema_step30.sql` in Supabase.
2. Push to GitHub — `vercel.json` now has two cron entries; Vercel will register both on the next successful deploy.
3. To test without waiting: open any ticket with no reply yet and manually back-date its `created_at` in Supabase's Table Editor to 7+ hours ago (for a response breach) or edit an old open ticket to 48+ hours ago (for a resolution breach). Sign in as Super Admin and visit `/api/cron/sla-check` directly. Confirm the alert appears and, for a breach, that the ticket's priority is now High. Reload the same URL and confirm it does *not* fire a duplicate alert.

## Follow-up — Parts & Consumables inventory

Third item off the improvements list: a real spare-parts stock catalog, plus a way to log what got used against a work order — separate from two things already in the app that sound similar but aren't this:

- **Inventory** (sidebar, `inventory_cycles` — Step 5) verifies that **assets** physically exist and are serviceable. An annual physical count, nothing to do with parts.
- **`service_record_parts`** (schema.sql, still used by the CM report's "Parts Replaced" field) is a free-text "what did you use" log with no catalog behind it and no stock tracking — just a list of names per report.

This is the real thing: a canonical parts list with an actual on-hand quantity, a reorder threshold, and a usage log tied to work orders that automatically decrements stock every time something gets logged.

**`schema_step31.sql`** (new) — **run this in Supabase before deploying.** Two tables:
- `parts` — the catalog: name, SKU, category, unit, quantity on hand, reorder threshold, unit cost, notes.
- `work_order_parts` — one row per "this part was used on this work order," snapshotting the part's name at the time (so the log stays readable even if the catalog entry is later renamed or removed) and who logged it.

A database trigger (`decrement_part_stock`) is what actually keeps stock in sync — every insert into `work_order_parts` decrements the matching `parts.quantity_on_hand` automatically, so a usage log and a stock change can never happen one without the other. It's allowed to go negative on purpose (over-logged usage vs. what's actually on the shelf is itself useful signal, same as a "Low Stock" flag).

**What's new in the app:**
- **Parts tab** (sidebar, staff-only, separate entry from Inventory) — catalog list with All / Low Stock / Out of Stock filter pills, `/parts/new` to add a part, and a detail/edit page per part showing its full usage history (which work orders consumed it, when, how much).
- **Work Orders** — each row now has a **Log Parts** button opening a small modal: pick a part, enter a quantity, submit. Logged parts show up as small tags under the task ("2× O-ring, 1× Filter Cartridge") right on the Work Orders table, so usage is visible without needing a full work-order detail page (which still doesn't exist — this modal is a deliberately lightweight substitute for that one action, not a first step toward building one).

Verified with `npx tsc --noEmit` (clean).

## Setup steps

1. Run `schema_step31.sql` in Supabase.
2. Push to GitHub.
3. Sign in as staff, go to **Parts** in the sidebar, add a test part with a reorder threshold (e.g. quantity 10, reorder at 5) — confirm it shows "In Stock."
4. Edit it down to 5 or below directly and confirm it flips to "Low Stock"; down to 0 and confirm "Out of Stock." (Or more realistically: leave it at 10, and instead—)
5. Go to **Work Orders**, click **Log Parts** on any row, pick your test part, log a quantity of 6, submit. Confirm: the tag "6× [part name]" appears under that work order's task, and back on the Parts tab, the part's on-hand count dropped to 4 and its status is now "Low Stock."
6. Click into the part's detail page and confirm the usage history shows that work order, quantity, and timestamp.

## Follow-up — renamed "Inventory" to spare parts, old feature is now "Asset Verification"

Per your call: "Inventory" now means the spare-parts/consumables stock tab (the more common everyday reading of the word) — the original inventory-cycles feature that used to own that label and route (`/inventory`, unchanged) is now labeled **Asset Verification** in the sidebar and on its own page instead. No routes, data, or schema changed — this is a label-only swap: `/inventory` (asset counts) ↔ `/parts` (stock levels, sidebar label "Inventory"). No SQL to run.

Verified with `npx tsc --noEmit` (clean).

## Follow-up — stock receiving ("In"), to go with parts-used logging ("Out")

You asked whether the Inventory tab could be the real system of record for all spare parts, and specifically whether deliveries arriving from a supplier could be logged too, not just usage. Yes to both — this adds the other half.

**`schema_step32.sql`** (new) — **run this in Supabase before deploying.** One table, `part_receipts`: quantity received, supplier (optional), PO/reference number (optional), unit cost for that specific delivery (optional — kept per-delivery rather than overwriting the catalog's general cost, since what you actually pay can drift over time), notes, who logged it. A trigger (`increment_part_stock`) adds the quantity straight to `parts.quantity_on_hand` on insert — the exact mirror of how logging a part **used** on a work order decrements it (schema_step31.sql).

**What's new in the app:**
- **Receive Stock** button — on every row of the Inventory list, and on a part's own detail page. Small modal: quantity, and optionally who it's from, a PO/reference number, unit cost, and notes.
- **Stock History** (part detail page, replaces the old "Usage History" section) — now a single merged, chronological ledger of everything that ever moved that part's stock: green `+N` for a delivery received, red `−N` for a use logged against a work order. This is the actual "In and Out" view — one place to see the full story of a part instead of two separate lists.

Same idempotency-free design as everything else here: this doesn't second-guess your numbers. Logging a delivery just adds; logging usage just subtracts; whatever `quantity_on_hand` lands on is trusted as the real count. If you're bringing in your *existing* real parts inventory rather than starting from zero, the fastest way in is to add each part once with its current on-hand quantity typed directly into the "Quantity on Hand" field on creation — you don't need to log a fake "receipt" for stock you already had before this system existed. From that point on, every real delivery and every real use should go through Receive Stock / Log Parts so the Stock History stays a true record going forward.

Verified with `npx tsc --noEmit` (clean).

## Setup steps

1. Run `schema_step32.sql` in Supabase.
2. Push to GitHub.
3. On the Inventory tab, click **Receive Stock** on any part, log a delivery of 10 with a supplier and PO number, submit. Confirm the on-hand count went up by 10.
4. Click into that part's detail page — confirm the delivery shows up in **Stock History** as a green `+10` with the supplier/PO you entered.
5. Log a use against it from Work Orders (existing **Log Parts** flow) and confirm that same Stock History list now also shows a red `−N` entry, correctly interleaved by time with the receipt from step 3.

## Follow-up — QR/barcode scanning on assets

Fourth item off the improvements list: scan an asset's tag on-site to jump straight to its record and a checklist, instead of searching for it manually.

**New dependencies** (`ams-web/package.json`) — **run `npm install` before this will build.** No sandbox registry access in this session, same situation as `leaflet`/`react-leaflet` earlier, so these are added to `package.json` but not yet installed:
- `qrcode` (+ `@types/qrcode`) — generates the QR code image server-side.
- `@zxing/browser` + `@zxing/library` — reads a QR code or barcode from the device camera in-browser. Supports far more than just QR (Code128, EAN, UPC, and others), which matters here since not every asset will have a fresh Phtek-printed tag — some already have an OEM barcode.

**No new environment variable needed.** The QR code encodes a full URL to that asset (`https://.../assets/<id>`), but instead of a hardcoded/configured domain, it reads the *actual request's* own host at render time (`next/headers`). That means it's automatically correct whether you're on localhost, a Vercel preview URL, or your real production domain later — nothing to misconfigure, nothing that can go stale if the domain ever changes.

**What's new in the app:**
- **Asset detail page** (staff only) — a new card up top with the asset's QR code, a **Download QR** link (for printing onto a physical tag), and two quick-action links: **Start PM Checklist** and **Start CM Report**, both landing on the report form with this exact asset already selected — no dropdown hunting.
- **Scan Asset** (new sidebar item, staff-only, `/assets/scan`) — opens the device camera right in the browser. On a successful scan:
  - If it's one of this app's own QR codes, it jumps straight to that asset — no database lookup needed, the id is right there in the URL.
  - Otherwise, it's tried as an exact match against `assets.serial_number` — so an asset's **existing** OEM barcode (if it has one) works too, not just a newly-printed Phtek tag.
  - No match found, or camera access denied/unsupported: a manual text-entry fallback is always available underneath, so this page is never a dead end.

**Requires HTTPS** (camera access via `getUserMedia` is blocked on plain HTTP by every browser) — already true for the Vercel deployment, same requirement the WebRTC calling feature already has.

Verified with `npx tsc --noEmit` — clean except for the two expected "module not found" errors for the not-yet-installed packages above; everything else type-checks.

## Setup steps

1. Run `npm install` locally (picks up the new packages).
2. No SQL to run — this feature has no schema changes.
3. Push to GitHub.
4. Sign in as staff, open any asset, and confirm the new QR card appears with a scannable code. Click **Download QR** and confirm a PNG downloads.
5. Click **Start PM Checklist** — confirm the Preventive Maintenance Checklist page opens with this exact asset already selected in the dropdown, not blank.
6. Go to **Scan Asset** in the sidebar, allow camera access when prompted, and point it at the QR code you just downloaded (displaying it on another screen or printout works fine) — confirm it navigates straight to that asset's page.
7. Test the fallback: type an existing asset's serial number into the manual entry box on the Scan Asset page and confirm it also navigates correctly. Try a made-up value and confirm you get a clear "no asset found" message instead of an error or dead end.

## Follow-up — hourly SLA checks via GitHub Actions (Vercel Hobby workaround)

Since you're staying on Vercel's Hobby plan for now, added `.github/workflows/sla-check.yml`: a scheduled GitHub Actions workflow that calls `/api/cron/sla-check` every hour, on top of (not instead of) Vercel's own once-daily cron. Same endpoint, same `CRON_SECRET`, same idempotent `sla_escalations` ledger — it's safe for both to call it; nothing double-fires. This closes the "up to 24h late" gap from the plan's cron limit without paying for Pro.

**One-time setup — add the secret GitHub Actions needs:**
1. On GitHub, open the `AMS` repo → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. Name: `CRON_SECRET`. Value: the exact same value you already put in Vercel's `CRON_SECRET` environment variable.
4. Save.

That's it — no other config. The workflow file itself is already wired to the production URL and runs on the schedule as soon as it's pushed to `main`.

**Verify it's working:**
1. Push this change (see commands below).
2. On GitHub, go to the **Actions** tab → **SLA Breach Check** in the left list.
3. Click **Run workflow** (the manual trigger, top right) to fire it immediately instead of waiting up to an hour.
4. Click into the run and expand the "Call SLA check endpoint" step — you should see `HTTP status: 200` and the same JSON body (`checked`, `escalated`, `skipped`) you saw testing manually earlier. A red X instead means something's wrong — most likely the secret doesn't match, or Deployment Protection got re-enabled on Vercel (see the earlier follow-up on that).

**Two things worth knowing:**
- GitHub automatically disables a scheduled workflow after **60 days with no commits to the repo** — harmless (it just stops silently, no email warning by default), but worth remembering if this project goes quiet between working sessions for a couple months. A quick way to re-enable it: Actions tab → the workflow → the "This scheduled workflow is disabled" banner has a re-enable button; or just push any commit, which reactivates it.
- This only speeds up the **SLA check**, not the **PM ticket generation** cron — that one's fine staying at once/day (a PM reminder being a few hours early or late doesn't carry the same urgency as an 8-hour response SLA). If you ever want that one hourly too, the same workflow pattern applies — just say so.

## Follow-up — Trends/Analytics view (client-facing)

Next item off the list: a view management can point to during a service-contract review — uptime %, ticket volume, and mean time to repair (MTTR), over time. Client-facing (also visible to staff, showing fleet-wide), separate from the tactical SLA widgets already on the Dashboard.

**`schema_step33.sql`** (new) — **run this in Supabase before deploying.** Adds one additive RLS policy on `audit_log`. Ticket volume and MTTR needed nothing new (`service_tickets` is already readable exactly the way this needs it — staff see every org, a client sees only their own). Uptime % is the one genuinely new metric, and rather than inventing a number, it's reconstructed from real history: every asset insert/update is already captured in `audit_log` (schema.sql's `log_audit()`), so "what fraction of assets were operational as of the end of month X" is answered by walking each asset's own status-change trail. The catch: `audit_log` reads are Super Admin-only (schema_step22b.sql), which would block both a regular Admin and every client from running that reconstruction. The new policy doesn't touch or narrow that — it just also lets staff read `audit_log` rows for the `assets` table fleet-wide, and lets a client read them for their own org's assets only. Every other table's audit trail stays exactly as restricted as before.

**`lib/analytics.ts`** (new) — the shared computation, used by both the page and the CSV export so the two can never drift apart. Buckets the last 6 calendar months and for each one computes: tickets opened, tickets resolved, MTTR (avg hours from opened to resolved, for tickets resolved that month), and uptime % (assets confirmed operational as of that month's end, over assets with a confirmed status by then — an asset with no audit history yet, or that didn't exist yet, is excluded from that month's count rather than guessed at).

**What's new in the app:**
- **Analytics** (new sidebar item, visible to both roles, matching Calendar/Reports) — a KPI row (avg uptime, 6-month ticket count, resolved count, avg repair time) plus three hand-rolled trend charts (same plain-div style as the Dashboard's SLA Historical Performance chart — no new charting library): Uptime %, Ticket Volume (opened vs. resolved), and Mean Time to Repair, each color-coded against a threshold (uptime tiers at 98%/90%, MTTR against the existing `SLA_RESOLUTION_TARGET_HOURS` target from `lib/sla.ts`).
- **Export CSV** button — `/api/reports/analytics/export`, one row per month plus a 6-month average/total row, same numbers as the page.

RLS scoping means staff and a client viewing this page never see the same numbers unless they happen to share a fleet — staff get everything, a client gets only their own org, with zero extra filtering logic in the page itself.

Verified with `npx tsc --noEmit` (clean).

## Setup steps

1. Run `schema_step33.sql` in Supabase.
2. Push to GitHub.
3. Sign in as staff, go to **Analytics** in the sidebar — confirm the KPI row and three charts render (months with no data yet show a `—` bar rather than a fake zero).
4. Click **Export CSV** and confirm the downloaded file's numbers match what's on screen.
5. Sign in as a client and confirm the same page shows only that org's tickets/assets — compare against what you already know about that org's data (or against the Dashboard's existing SLA widgets for a sanity check on ticket-derived numbers).
6. To see uptime move: change an asset's status (e.g. to "Down") on the Assets tab, then back to "Operational." Revisit Analytics — this month's uptime bar should reflect the asset having spent part of the month in the audit trail as non-operational once you check next month's bucket (the current month always reflects the *latest* known status, since "as of now" is the same as "as of month-end" while you're still inside that month).
