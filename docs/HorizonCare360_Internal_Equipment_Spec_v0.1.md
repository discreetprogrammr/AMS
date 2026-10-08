# HorizonCare360: PHtek Internal Equipment List, Build Spec v0.1

**Owner:** CTO
**Date:** 30 September 2026
**Repo:** `discreetprogrammr/AMS` (Next.js app in `ams-web/`)
**Status:** Draft for CTO review. Nothing in this spec has been built yet.

---

## 1. Summary

Use HorizonCare360 as Pacific Horizon Tek's (PHtek) own register for the company equipment issued to staff. That covers laptops, phones, tablets, monitors, printers, access cards, and Team Fridays Digital's camera and production kit. All of it is owned by PHtek. Each item is tagged with the segment that uses it (Pacific Horizon Tek or Team Fridays Digital) so the two can be viewed separately.

**Primary users (v1):** the CTO (Super Admin), the Technical Department Manager (Admin), and HR & Admin staff (Admin). Employees do not get logins in v1.

**Goal for v1:**
- PHtek's 73 current items are imported and can be filtered by segment and custodian.
- The sidebar for the people managing this list shows only the modules that matter to it.
- Internal equipment never shows up in client-facing features, fleet statistics, or client alerts.

**Source data:** `PHTEK_Equipment_List_Segmented.xlsx`, the cleaned version of `PHTEK_Complete_Equipment_List.xlsx`. It has 73 assets (38 Pacific Horizon Tek, 35 Team Fridays Digital) plus 8 consumables, which are not imported.

---

## 2. Decisions locked in

- **One codebase and one Supabase project.** Internal equipment lives in the existing `assets` table, not a separate app or table.
- **One organisation for PHtek.** It is a new `organizations` row, "Pacific Horizon Tek, Inc.", flagged `is_internal = true`. Team Fridays Digital is **not** its own organisation, because it is a PHtek segment. It is a value in a new `segment` column.
- **HR & Admin staff get the existing `admin` role.** Chosen by the CTO on 30 Sep 2026. See 9.1 for what this exposes.
- **Sidebar trimming uses the existing per-user `hidden_modules` mechanism** (schema_step44.sql). There is no new per-organisation module system in v1 (see 5.3 for why).
- **Consumables are not assets.** SIM cards, memory cards, ink, cables and bags stay in the spreadsheet's Consumables tab.
- **Asset numbers are kept as they are.** `PHT-EQ-0001` and so on become `asset_tag` and are never renumbered.
- **Schema change process as per CLAUDE.md:** a new idempotent `schema_step46.sql` at the repo root, run by hand in the Supabase SQL editor, and documented in a README journal section.
- **The brand is written "HorizonCare360"** in all UI copy.

---

## 3. What I actually checked in the code

Read on 30 Sep 2026 from the local working copy. Read on the `next-16-upgrade` branch (commit `9bf3068`); `main` is at `88a9b7b`.

- **Per-user module hiding already exists and is enforced.**
  - `profiles.hidden_modules` (step 44) hides sidebar items in `components/sidebar.tsx`.
  - `lib/supabase/middleware.ts` redirects blocked routes to `/dashboard?access_denied=1`.
  - Super Admin is exempt from blocking, and `/dashboard` and `/user-access` are always accessible.
  - The module list lives in `lib/nav-items.ts` (`NAV_MODULES`).
- **Roles** are `super_admin`, `admin` and `client_viewer` (step 22).
  - RLS (row-level security) gives `admin` and `super_admin` read and write access to **all** organisations' rows.
  - `client_viewer` can read only its own organisation's rows and cannot edit assets.
- **The `assets` table already has** `asset_tag`, `brand`, `model`, `serial_number`, `status`, `warranty_end_date`, `custodian` (free text), `install_date` and `site_id`.
  - `equipment_type` is an enum of NII product lines plus `other`.
  - `status` is `operational | attention | down | unserviceable`.
- **Analytics counts every asset with no organisation filter** (`lib/analytics.ts` line 65, `supabase.from("assets").select("id, status, created_at")`). Without the exclusion in section 6, PHtek laptops would be counted in client fleet statistics.
- **The compliance cron job reads assets for warranty expiry** (`lib/compliance-alerts.ts` line 78). Without section 6, it would raise warranty alerts for staff phones.
- **There are 42 places in `app/` and `lib/` that query `assets`.** Not all of them were read. Section 6 lists the ones known to matter. Claude Code must grep the rest.
- **Branches (corrected 8 Oct 2026):** `main` is still Next.js 14 / React 18, matching CLAUDE.md. The Next 15 / React 19 upgrade sits on the unmerged `next-16-upgrade` branch. This series branches from `main`, not from the upgrade branch.

---

## 4. Data model (`schema_step46.sql`)

All changes are additive and nullable, so existing client assets are untouched. The file must be idempotent (`if not exists` guards), per CLAUDE.md.

### 4.1 Internal organisation flag

```sql
alter table organizations add column if not exists is_internal boolean not null default false;
```

Seed one row, "Pacific Horizon Tek, Inc.", with `is_internal = true` and one site, "Head Office". Guard the seed with a `where not exists` check on the name.

### 4.2 New asset columns

| Column | Type | Maps from spreadsheet |
|---|---|---|
| `segment` | text, check in (`pacific_horizon_tek`, `team_fridays_digital`) | Segment |
| `asset_category` | text | Equipment Category |
| `description` | text | Equipment / Description |
| `quantity` | integer, default 1 | Qty |
| `ownership` | text, check in (`company_owned`, `leased_rented`, `client_owned`, `other`) | Ownership |
| `date_acquired` | date | Date Acquired |
| `acquisition_cost` | numeric(12,2), PHP | Acquisition Cost |
| `supplier` | text | Supplier |
| `department` | text | Department |
| `date_issued` | date | Date Issued |
| `assignment_status` | text, check in (`assigned`, `in_stock`, `returned`, `retired_disposed`, `lost`) | Status |
| `condition` | text, check in (`new`, `good`, `fair`, `for_repair`, `damaged`, `lost`) | Condition |
| `return_disposal_date` | date | Return / Disposal Date |
| `remarks` | text | Remarks |
| `parent_asset_id` | uuid references `assets(id)` on delete set null | For desktop components (4.4) |

**Existing columns reused as-is:**
- `asset_tag` holds the Asset No.
- `brand`, `model` and `serial_number` hold the matching spreadsheet columns.
- `custodian` holds Assigned To / Custodian.
- `warranty_end_date` holds Warranty Expiry. Rows whose warranty is still text are left null.
- `site_id` points to the "Head Office" site.
- `equipment_type` is always `other` for internal items.

**Also to add:** a check constraint (or application rule) that `segment` is non-null if and only if the asset's organisation has `is_internal = true`. Claude Code should propose the cleanest way to enforce this. A trigger is acceptable.

The existing `assets_audit` trigger already covers every change to these columns, so there is a full audit trail for free.

### 4.3 Status mapping

The existing `status` column describes operating state and drives several dashboards. For internal items, keep it consistent like this:

| Spreadsheet Status or Condition | `assignment_status` | `condition` | `assets.status` |
|---|---|---|---|
| Assigned or In Stock, Good/New/Fair | assigned / in_stock | good / new / fair | `operational` |
| Condition = For Repair | unchanged | `for_repair` | `down` |
| Condition = Damaged | unchanged | `damaged` | `attention` |
| Retired / Disposed or Lost | `retired_disposed` / `lost` | as given | `unserviceable` |

### 4.4 Desktop PC as a parent asset

Items PHT-EQ-0072 to 0081 are the parts of one desktop. Create one new parent asset, "Team Fridays Digital Desktop PC", and set `parent_asset_id` on the ten parts.

- The parent needs a new tag. Proposed: `PHT-EQ-0082`. **Confirm with the CTO.**
- The parts keep their serial numbers for warranty claims.

---

## 5. Sidebar modules

### 5.1 Module list for the internal equipment role

From `lib/nav-items.ts`. Dashboard and User Access are always visible and are not listed.

| Module | Route | For internal equipment | Why |
|---|---|---|---|
| Assets | `/assets` | **Show** | The register itself |
| Scan Asset | `/assets/scan` | **Show** | QR (quick-response code) tags for spot checks and audits |
| Asset Verification | `/inventory` | **Show** | Physical inventory count cycles (step 5); use it for the annual equipment count |
| Alerts | `/alerts` | **Show** | Staff-logged alerts, e.g. lost or damaged items |
| Fleet Map | `/fleet-map` | Hide | Client site map |
| Clients | `/clients` | Hide | Client organisations |
| Work Orders | `/work-orders` | Hide | Field service |
| Tickets | `/tickets` | Hide in v1 | Client service tickets. Could later be used for internal repairs, see 12 |
| Inspections | `/inspections` | Hide | NII equipment inspections |
| Inventory | `/parts` | Hide | Spare parts stock |
| HorizonCare360 Assist | `/messages` | Hide | Client support chat |
| Calendar | `/calendar` | Hide | Service scheduling |
| Reports | `/reports` | Hide | NII service forms (radiation survey, PM (preventive maintenance) checklist and so on) |
| Analytics | `/analytics` | Hide | Fleet uptime and SLA (service level agreement) statistics |
| SLA Policy | `/sla-settings` | Hide | Client SLAs |
| Audit Log | `/audit-log` | Super Admin only already | |
| Error Logs | `/error-logs` | Super Admin only already | |

### 5.2 "Internal equipment only" preset in User Access

Add one button to `app/user-access` that fills a user's `hidden_modules` with every module marked Hide above. It is a convenience only. The Super Admin can still tick or untick individual modules afterwards.

- Define the preset as a constant next to `NAV_MODULES` in `lib/nav-items.ts`, keyed by `href`, following that file's existing reasoning.
- Write it through the existing `app/user-access/actions.ts` service-role path, gated by `requireSuperAdmin()`.

### 5.3 Why not a per-organisation module switch in v1

The original idea was to switch modules per organisation. It does not fit the chosen roles:
- The HR & Admin users are `admin`, and admins are not scoped to one organisation (`organization_id` is null for staff in `schema.sql`).
- The per-user mechanism already exists, is enforced in middleware, and covers all of v1.

A per-organisation module switch (useful later for selling module packages to clients) is recorded in 12 as a separate future item.

---

## 6. Keeping internal equipment out of client features

This is the most important correctness work in this series. **Rule:** assets whose organisation has `is_internal = true` are excluded from:

1. **Analytics:** asset counts, uptime and status breakdowns (`lib/analytics.ts`).
2. **Dashboard widgets** that count assets or statuses (`app/dashboard/*`). NOT VERIFIED which widgets; grep.
3. **Fleet Map** (`app/fleet-map/*`).
4. **Cron jobs:**
   - `pm-due`, `sla-check` and `weekly-digest`: exclude.
   - `compliance-check`: see open question 12.3.
5. **Clients list** and client detail pages: the internal organisation must not appear as a client.
6. **Asset and ticket exports** under `app/api/assets/export/*` and `app/api/reports/*`: exclude by default, and add an explicit "Internal only" export instead (see 7.4).
7. **Any organisation picker** used when creating client assets, tickets or work orders.

**Implementation guidance for Claude Code:**
- Prefer one helper, for example `excludeInternal(query)` or a database view `client_assets`, over scattered `.neq()` calls.
- List every one of the 42 `from("assets")` call sites in the PR description, marked "excluded", "not applicable" or "intentionally includes internal".

---

## 7. Assets page changes

### 7.1 Filters

- Add an **Organization** filter to `/assets`. It already selects `organizations(name)`.
- Add a **Segment** filter, shown only when the selected organisation is internal.
- Keep the filter state in URL search params so a filtered view can be bookmarked. Do not use localStorage.

### 7.2 Table columns when viewing the internal organisation

Show these columns: Asset Tag, Category, Description, Brand / Model, Serial, Custodian, Department, Segment, Assignment Status, Condition, Warranty End.

Hide the NII-only columns (Equipment Type, PNRI (Philippine Nuclear Research Institute) license, Next Service Due).

### 7.3 Asset form

- When the selected organisation is internal, show the new 4.2 fields and hide the NII-only fields (`pnri_license_number`, `next_service_due`, `sold_by`).
- `segment` is required for internal assets.
- Follow the design-system rules in CLAUDE.md:
  - semantic tokens only;
  - no literal Tailwind colours;
  - no `dark:` classes;
  - status pills in the 400 shade on a translucent background.

### 7.4 Export

Add an "Export internal equipment" CSV using the same columns as the spreadsheet's Equipment List plus Segment, so the register can go back to Excel for accounting.

---

## 8. Import

- **One-off import of the 73 items.** Generate a SQL insert script from `PHTEK_Equipment_List_Segmented.xlsx`, to run by hand after step 46.
  - This avoids stretching the client CSV importer for a single load.
  - The script must be idempotent: skip rows whose `asset_tag` already exists.
- **Custodian stays free text in v1.** Normalise the spelling first (see 12.4).
- **Ongoing additions** are made through the asset form in v1. Extending `app/assets/import` to accept internal columns is out of scope (see 10).

---

## 9. Access and privacy

### 9.1 What the `admin` role exposes

HR & Admin staff as `admin` can read and edit **every client's** assets, tickets, service records, HorizonCare360 Assist messages and custodian names. Hiding modules (5.2) removes the menu items and blocks the routes. However, `/assets` itself will still list client assets unless the Organization filter is set. The database does not restrict them.

This is a RA 10173 (Data Privacy Act) consideration: client personal data (custodian names, contact persons) becomes visible to more PHtek staff.
- CLAUDE.md says anything changing who processes customer data "gets raised, not assumed". This section is that raise.
- Mitigations in v1:
  - modules hidden per user;
  - every change captured by the existing audit trigger;
  - the Audit Log is Super Admin-only.
- **The CTO accepted this trade-off on 30 Sep 2026.** Record it as a decision record in `PHtek CTO/decisions/`, with the reopening condition "a second client-data-sensitive tenant (e.g. BSP (Bangko Sentral ng Pilipinas)) goes live, or HR & Admin headcount grows".

### 9.2 Employee data

Custodian names and the equipment assigned to each employee are employee personal data under RA 10173. They are not sensitive personal information. They are stored in the same Supabase project, in Singapore (Vercel `sin1`). The Supabase region is NOT VERIFIED; confirm in the Supabase dashboard.

---

## 10. Out of scope for v1

- Employee logins and a "My Equipment" read-only view (decided 30 Sep 2026: managers only for now).
- A new organisation-scoped manager role (see 12.1).
- A per-organisation module switch or client module packages.
- Custodian as a link to a user or HR record. It stays free text. Integration with the HR web app is later.
- Accountability receipts (signed issuance forms) and offboarding return checklists.
- Depreciation schedules.
- Extending the CSV importer to internal columns.
- Consumables tracking.
- Segments other than Pacific Horizon Tek and Team Fridays Digital. The check constraint makes them a one-line change later.

---

## 11. Costs and approval

- **One-off:** none beyond engineering time (CTO plus Technical Department Manager).
- **Recurring:** none expected. 73 rows is negligible storage. The current Supabase plan and its limits are NOT VERIFIED; check the Supabase billing page before assuming the free tier covers it.
- **Approval needed:** none financial. The access decision in 9.1 is the CTO's, and is recorded there.

---

## 12. What I still need from you

| # | Question | Decider |
|---|---|---|
| 12.1 | Accept the 9.1 exposure for v1, or build an org-scoped manager role now (about one extra migration plus RLS changes)? | CTO (chose admin on 30 Sep; confirm after reading 9.1) |
| 12.2 | New asset tag for the desktop parent: `PHT-EQ-0082`? | CTO |
| 12.3 | Should the compliance cron job send warranty-expiry alerts for internal equipment (to the CTO or HR only), or skip them? | CTO |
| 12.4 | Correct spelling of "Jamie D.G. Pelacio" (spreadsheet) vs "Jaime" | HR Manager |
| 12.5 | Named custodians for items listed as "Office" / "Office (Desktop)" (PHT-EQ-0042 to 0044, 0071 to 0081) | HR Manager; Team Fridays Digital head for 0071 to 0081 |
| 12.6 | Missing acquisition costs (21 items) and dates acquired (6 items) | HR & Admin, from receipts |
| 12.7 | Which HR & Admin users get accounts, and their email addresses | CTO / HR Manager |

---

## 13. Build order (small PRs, per CLAUDE.md)

1. **PR 1: Schema.** Add `schema_step46.sql` (4.1 to 4.3) and a README journal section, "Database change, run this first". No app changes.
2. **PR 2: Exclusion.** Section 6: add the helper and apply it at every call site, with the call-site list in the PR description.
3. **PR 3: Assets UI.** Section 7: filters, internal columns, form fields and the internal export.
4. **PR 4: User Access preset.** Section 5.2.
5. **PR 5: Data load.** Section 8: the idempotent insert script, plus the 4.4 parent asset.
6. **PR 6: Housekeeping.** Add the internal-organisation rule (section 6) to CLAUDE.md.

Each PR must pass `npx tsc --noEmit` and `npm run lint` from `ams-web/`.

---

## 14. Definition of done

- [ ] `schema_step46.sql` has been run in production, and running it a second time makes no changes.
- [ ] The internal organisation exists with `is_internal = true` and one "Head Office" site.
- [ ] 73 internal assets are imported: 38 Pacific Horizon Tek and 35 Team Fridays Digital.
- [ ] Analytics, dashboard counts, Fleet Map, Clients and client exports show the same numbers as before the import.
- [ ] No cron job raises an alert for an internal asset, unless 12.3 says otherwise.
- [ ] The User Access preset leaves an HR & Admin user seeing Dashboard, Assets, Scan Asset, Asset Verification, Alerts and User Access (if Super Admin) only. Typing a hidden route redirects to `/dashboard`.
- [ ] `/assets` filtered to the internal organisation and segment "Team Fridays Digital" shows 35 rows.
- [ ] The internal CSV export opens in Excel with the spreadsheet's columns plus Segment.
- [ ] A decision record for 9.1 is filed in `PHtek CTO/decisions/`.
- [ ] `tsc` and `lint` are clean.

---

## Appendix A: Prompt to start PR 1 in Claude Code

```
Read CLAUDE.md and the README.md section for Step 44 first.

Implement PR 1 from HorizonCare360_Internal_Equipment_Spec_v0.1.md
(sections 4.1, 4.2, 4.3 only): write schema_step46.sql at the repo root.

Requirements:
- Idempotent: every add column uses "if not exists"; constraints are
  added only if missing; the seed insert for the "Pacific Horizon Tek, Inc."
  organization (is_internal = true) and its "Head Office" site uses
  "where not exists".
- All new asset columns nullable except quantity (default 1).
- Check constraints exactly as listed in section 4.2.
- Propose, but do not silently choose, how to enforce "segment non-null
  iff organization is internal" (trigger vs application rule). Ask me.
- Do not touch any app code in this PR.
- Append a README.md journal section in the existing shape, with
  "Database change, run this first".
- Show me the SQL before committing.
```
