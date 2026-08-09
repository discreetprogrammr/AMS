-- Pacific Horizon Tek — Asset Management Software
-- Initial Supabase (Postgres) schema — implements Section 2 & 3 of AMS_Spec_v0.3
-- Run this once in the Supabase SQL editor on a fresh project (Step 1 of the build order).

create extension if not exists pgcrypto;

-- ── Enums ─────────────────────────────────────────────────────────────────

create type equipment_type as enum ('xray_screening', 'people_threat_screening', 'water_generation', 'pump', 'other');
create type asset_status as enum ('operational', 'under_maintenance', 'unserviceable');
create type sold_by_type as enum ('pacific_horizon_tek', 'third_party');
create type service_type as enum ('preventive_maintenance', 'radiation_survey', 'calibration', 'repair', 'water_quality_test');
create type service_result as enum ('pass', 'fail');
create type part_status as enum ('used', 'needed');
create type ticket_status as enum ('open', 'in_progress', 'resolved');
create type ticket_priority as enum ('low', 'medium', 'high');
create type user_role as enum ('internal_staff', 'client_viewer');

-- ── Core tables ───────────────────────────────────────────────────────────

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text,                 -- customs / aviation / government / hotel / security
  primary_contact text,
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  address text,
  site_contact text,
  created_at timestamptz not null default now()
);

-- Extends Supabase's built-in auth.users with app-level role and org scoping.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'client_viewer',
  organization_id uuid references organizations(id),   -- null for internal staff
  created_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id),
  asset_tag text not null,
  equipment_type equipment_type not null,
  brand text,                  -- Linev / Apstec / Watergen / Desmi / Astrophysics / Rapiscan / Nuctech / other
  model text,
  serial_number text,
  sold_by sold_by_type not null default 'pacific_horizon_tek',
  install_date date,
  status asset_status not null default 'operational',
  warranty_end_date date,
  custodian text,               -- COA-style accountable person
  pnri_license_number text,     -- X-ray units only
  next_service_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  service_type service_type not null,
  date_performed date not null,
  performed_by text,            -- engineer/technician or radiation surveyor name
  findings text,
  result service_result,        -- pass/fail, where applicable (e.g. radiation survey)
  next_due_date date,
  report_url text,              -- points to a file in Supabase Storage
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table service_record_parts (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null references service_records(id) on delete cascade,
  part_name text not null,
  quantity int not null default 1,
  status part_status not null default 'needed'
);

create table compliance_certificates (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  certificate_type text not null,   -- e.g. "PNRI Radiation License", "Warranty", "Calibration Certificate"
  issue_date date,
  expiry_date date,
  file_url text,
  created_at timestamptz not null default now()
);

create table service_tickets (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  raised_by uuid references profiles(id),
  description text not null,
  status ticket_status not null default 'open',
  priority ticket_priority not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generic audit trail — satisfies the COA "audit trail" mapping in the spec.
create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create or replace function log_audit() returns trigger
language plpgsql security definer as $$
begin
  insert into audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    case when TG_OP = 'DELETE' then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$$;

create trigger assets_audit after insert or update or delete on assets
  for each row execute function log_audit();
create trigger service_records_audit after insert or update or delete on service_records
  for each row execute function log_audit();
create trigger service_tickets_audit after insert or update or delete on service_tickets
  for each row execute function log_audit();

-- ── Row Level Security ───────────────────────────────────────────────────
-- Internal staff (role = 'internal_staff') see and manage everything.
-- Client viewers see only records scoped to their own organization_id.
-- This is the RLS approach called out in AMS_Spec_v0.3, Section 8.

create or replace function is_internal_staff() returns boolean
language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'internal_staff');
$$;

create or replace function my_organization_id() returns uuid
language sql security definer stable as $$
  select organization_id from profiles where id = auth.uid();
$$;

alter table organizations enable row level security;
alter table sites enable row level security;
alter table assets enable row level security;
alter table service_records enable row level security;
alter table service_record_parts enable row level security;
alter table compliance_certificates enable row level security;
alter table service_tickets enable row level security;
alter table profiles enable row level security;

create policy "read own org or all if staff" on organizations
  for select using (is_internal_staff() or id = my_organization_id());
create policy "staff manage organizations" on organizations
  for all using (is_internal_staff());

create policy "read own org sites or all if staff" on sites
  for select using (is_internal_staff() or organization_id = my_organization_id());
create policy "staff manage sites" on sites
  for all using (is_internal_staff());

create policy "read own org assets or all if staff" on assets
  for select using (is_internal_staff() or organization_id = my_organization_id());
create policy "staff manage assets" on assets
  for all using (is_internal_staff());

create policy "read own org service records or all if staff" on service_records
  for select using (
    is_internal_staff()
    or asset_id in (select id from assets where organization_id = my_organization_id())
  );
create policy "staff manage service records" on service_records
  for all using (is_internal_staff());

create policy "read own org parts or all if staff" on service_record_parts
  for select using (
    is_internal_staff()
    or service_record_id in (
      select sr.id from service_records sr
      join assets a on a.id = sr.asset_id
      where a.organization_id = my_organization_id()
    )
  );
create policy "staff manage parts" on service_record_parts
  for all using (is_internal_staff());

create policy "read own org certificates or all if staff" on compliance_certificates
  for select using (
    is_internal_staff()
    or asset_id in (select id from assets where organization_id = my_organization_id())
  );
create policy "staff manage certificates" on compliance_certificates
  for all using (is_internal_staff());

create policy "read own org tickets or all if staff" on service_tickets
  for select using (
    is_internal_staff()
    or asset_id in (select id from assets where organization_id = my_organization_id())
  );
create policy "clients can raise tickets on own assets" on service_tickets
  for insert with check (
    asset_id in (select id from assets where organization_id = my_organization_id())
  );
create policy "staff manage tickets" on service_tickets
  for all using (is_internal_staff());

create policy "read own profile or all if staff" on profiles
  for select using (id = auth.uid() or is_internal_staff());
create policy "staff manage profiles" on profiles
  for all using (is_internal_staff());
