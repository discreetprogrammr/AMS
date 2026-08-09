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
