# AMS / HorizonCare360

Lifecycle asset management portal for detection and NII (non-intrusive
inspection) equipment. Owned by Pacific Horizon Tek, Inc. (PHtek), a
Philippine distributor of X-ray screening, detection, water and pump
product lines.

Brand name is written **HorizonCare360**, one word, no space. This is the
form filed as the IPOPHL word mark (application EFPH202600004048100,
classes 9/37/42). Never write "HorizonCare 360" in UI copy, PDFs, email
templates or docs.

## Repository shape

This repo root is not the app. Read this before assuming any path.

```
.                      <- repo root, remote: discreetprogrammr/AMS, branch main
├── README.md          <- the project journal. 1,885 lines. See below.
├── schema.sql         <- initial schema
├── schema_step5.sql   <- ... through schema_step45.sql, the migration series
├── seed_ppa_demo*.sql <- demo tenant data (Philippine Ports Authority)
├── .github/workflows/ <- sla-check.yml, an hourly GitHub Actions job
└── ams-web/           <- THE NEXT.JS APPLICATION. Vercel's root directory.
```

Vercel project `ams-web` builds from `ams-web/`, not from the repo root.
`npm` commands belong in `ams-web/`. SQL and the journal belong at the root.

## The application (ams-web/)

A single Next.js 14 App Router application. Not a monorepo, no workspaces,
no Turborepo.

- Next.js 14.2 (App Router) + React 18, TypeScript with `strict: true`.
- Package manager: **npm** (`ams-web/package-lock.json`). Do not introduce
  pnpm or yarn, and do not commit a second lockfile.
- Tailwind CSS 3.4 + PostCSS. No component library.
- Supabase (`@supabase/supabase-js` + `@supabase/ssr`) for auth, database
  and storage.
- Deployed on Vercel, region `sin1` (Singapore).
- Path alias: `@/*` maps to `ams-web/`.
- Mobile is a **PWA**, not React Native: service worker, install prompt,
  Web Push via VAPID. There is no native app.

Layout inside `ams-web/`:

- `app/` routes, one directory per feature area (assets, tickets,
  work-orders, inspections, inventory, parts, clients, reports, analytics,
  calendar, fleet-map, messages, alerts, audit-log, error-logs,
  sla-settings, user-access, profile, login, dashboard).
- `app/*/actions.ts` server actions. Mutations live here, not in API
  routes, unless something external has to call them.
- `app/api/` route handlers for exports, imports, PDF generation, client
  error logging, TURN credentials, and the five `app/api/cron/*` jobs.
- `components/` 18 shared components. Check here before creating one.
- `lib/` domain logic: `sla.ts`, `sla-escalation.ts`, `pm-automation.ts`,
  `compliance-alerts.ts`, `low-stock-alerts.ts`, `notify.ts`, `push.ts`,
  `email.ts`, `analytics.ts`, `audit.ts`, `error-log.ts`, `report-*.ts`,
  `csv-import.ts`, `ph-locations.ts`, `philippines-geo.ts`.
- `lib/pdf/` a hand-rolled PDF writer. No PDF library.

## Database: how schema changes actually work

There is no migration tool and no Supabase CLI workflow. The process is
deliberate and manual:

1. Write the change as a new numbered file at the repo root,
   `schema_step<N>.sql`. The series currently ends at `schema_step45.sql`,
   so the next one is **46**.
2. Make it **idempotent**. Later steps in the series say `[idempotent]` in
   their header comment and use `if not exists` style guards, because they
   get run more than once across environments.
3. Apply it by pasting the whole file into the Supabase SQL editor and
   running it. Nothing applies it automatically.
4. Add a **"Database change, run this first"** section to `README.md`
   describing what it does and why, before the setup steps for that
   feature.

Never assume a column or table exists. Never silently depend on a schema
change: state the exact SQL and say it must be run first.

## Scheduled work: two mechanisms, both real

**Vercel Cron Jobs** (`ams-web/vercel.json`), all daily or weekly:

| Schedule (UTC) | Job | Purpose |
| --- | --- | --- |
| 01:00 daily | `pm-due` | Raise preventive maintenance tickets before they fall due |
| 03:00 daily | `sla-check` | Detect and escalate SLA breaches |
| 05:00 daily | `compliance-check` | Warn on expiring certificates and warranties |
| 07:00 daily | `low-stock-check` | Warn on parts below reorder level |
| 08:00 Mondays | `weekly-digest` | Weekly summary email |

**GitHub Actions** (`.github/workflows/sla-check.yml`) calls the same
`sla-check` endpoint **hourly**. This exists because the Vercel account is
on the Hobby plan, which caps cron jobs at once per day. Running both is
safe: the `sla_escalations` ledger is idempotent, so nothing double-fires.

Both paths authenticate with `CRON_SECRET`, which therefore lives in **two
places**: Vercel's environment variables and the repo's GitHub Actions
secrets. Change it in one and you must change it in the other.

The `middleware.ts` matcher deliberately **excludes `/api/*`** from the
login redirect, because each API route does its own check: a `CRON_SECRET`
bearer token or a Super Admin session. Do not "fix" that exclusion by
adding `/api/*` back into the matcher. It silently breaks every scheduled
job.

## The design system

Theme tokens are CSS custom properties in `ams-web/app/globals.css`,
surfaced to Tailwind through `tailwind.config.ts` using the
`rgb(var(--token) / <alpha-value>)` pattern.

- `:root` is **dark**. Dark is the app's default, not the alternate.
- `.light` on `<html>` overrides every token for light mode.
- Because the tokens flip, **never write `dark:` variant classes**.
- **Never use a literal Tailwind color** (`text-white`, `bg-slate-800`).
  Use the semantic tokens: `base`, `surface`, `surface-2`, `surface-hover`,
  `hairline`, `hairline-strong`, `ink`, `ink-soft`.
- Status colors are the `400` shade only, on a translucent pill such as
  `bg-amber-500/15`.
- A new semantic color means adding the variable to both `:root` and
  `.light` in `globals.css` and mapping it in `tailwind.config.ts`. Do not
  skip the light half.

## Environment

`ams-web/.env.local.example` is the authoritative, commented list. Several
groups degrade silently and on purpose:

- **Resend** (`RESEND_*`) unset means email notifications are skipped.
  `lib/email.ts` returns a soft failure, never throws.
- **VAPID** (`*VAPID*`) unset means push is skipped, and the subscribe
  button in the topbar renders `null` rather than showing an error.
- **Metered** (`METERED_APP_NAME`, `METERED_API_KEY`) unset means calling
  falls back to STUN only, so calls work on one network but not across
  networks. The route returns an `X-Ice-Mode` header saying which case it
  is in.

Preserve that graceful degradation in any new notification path. Also
preserve the diagnostic breadcrumb: a feature that silently does nothing
needs a way to tell you it is unconfigured.

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. It must never appear in
a `NEXT_PUBLIC_*` variable or reach client code.

## Verifying a change

There is no test framework. From `ams-web/`:

1. `npx tsc --noEmit`. Fastest real check, and `strict` is on so it catches
   type errors. `npm run build` is the fuller check but takes minutes.
2. **`npm run lint` does not work.** ESLint has never been configured in
   this project: there is no `.eslintrc*` and no `eslint.config.*`, so
   `next lint` drops into an interactive "how would you like to configure
   ESLint?" prompt and waits forever. Do not run it in an automated context
   and do not answer the prompt casually, since that writes config and
   changes the project. Setting ESLint up properly is worthwhile but is its
   own piece of work.
3. For cron or client errors, `node check-errors.mjs [sourcePrefix] [limit]`
   queries the production `error_logs` table with the service-role key.
   `node check-errors.mjs cron 10` shows recent cron failures;
   `node check-errors.mjs` alone prints the five
   most recent `client:render` rows.

Treat "it type-checks and builds" as the floor, not proof. If a change is risky
and you cannot verify it, say so plainly rather than implying it was
tested.

## README.md is the project journal

The root `README.md` is a chronological build log, one section per step or
feature, each with "What's here", "Database change, run this first" where
relevant, and "Setup steps". It is not a conventional readme and should
not be rewritten into one.

Before working on a feature, read its section. After shipping one, append
a new section in the same shape. That file is the history of why things
are the way they are.

## Settled decisions, do not reopen without asking

- HorizonCare360's ticketing is **separate** from the internal PHtek CRM.
  Different product, different users, different repo.
- Mobile is the PWA. Do not propose React Native.
- Compliance context: RA 10173 (Philippine Data Privacy Act) and EO 119.
  Anything changing where customer data is stored or processed gets
  raised, not assumed.
- See `PHtek CTO/decisions/` in the CTO working folder for closed
  questions with their reopening conditions.

## How to work here

- Read before writing. 180 TypeScript files already exist with settled
  patterns. Match them rather than introducing new ones.
- Small, reviewable changes. The team is the CTO plus one Technical
  Department Manager, so large work lands as a series.
- Commit in small logical units with a message saying why, not what. Do
  not rewrite pushed history.
- If a requirement is ambiguous, ask. Do not pick a reasonable default and
  build on it silently.
