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

## Next (Step 3 in the spec)

Once the asset registry is confirmed working, the next step is the internal dashboard (KPI row, alerts panel) and reporting/export, per Section 6 of the spec.
