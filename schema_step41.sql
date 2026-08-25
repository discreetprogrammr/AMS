-- Step 41: Expanded Reports tab — Installation, Radiation Survey Test,
-- Site Survey, and Training reports, alongside the existing PM/CM.
--
-- Context: every PM visit on X-ray/radiation-emitting equipment also
-- includes a Radiation Survey Test (a PNRI compliance requirement) — that
-- service_type value ('radiation_survey') has existed since schema.sql,
-- but was only ever filed through the generic Preventive checklist form,
-- with no dedicated fields (readings, surveyor, meter used). This gives
-- it — and three brand-new report types that never had a form at all —
-- their own dedicated forms and data.
--
-- Run this in Supabase before deploying the code that depends on it.

-- New service_type values. Postgres allows ALTER TYPE ... ADD VALUE inside
-- a transaction as long as the new value isn't referenced by name in that
-- same transaction — nothing below does, so this is safe to run as one
-- script.
alter type service_type add value if not exists 'installation';
alter type service_type add value if not exists 'site_survey';
alter type service_type add value if not exists 'training';

-- Site Survey and Training reports can legitimately happen before any
-- asset exists at a site (a pre-installation site assessment, or general
-- safety training not tied to one specific unit), so asset_id can no
-- longer be required on every row. site_id gives those reports something
-- to attach to instead. The CHECK keeps every row attached to at least
-- one of the two, so nothing is ever orphaned from an organization.
alter table service_records alter column asset_id drop not null;
alter table service_records add column if not exists site_id uuid references sites(id) on delete cascade;
alter table service_records add constraint service_records_asset_or_site
  check (asset_id is not null or site_id is not null);

-- Radiation Survey Test-specific fields. Survey meter details are plain
-- free-text columns for now, not a foreign key — a proper "Survey Meters"
-- registry (tracking each meter's own annual PNRI calibration, separate
-- from the client's equipment) is a planned follow-up. Keeping these as
-- text here means today's surveys are still fully documented before that
-- registry exists, and can be backfilled/linked to it later without any
-- data loss.
alter table service_records add column if not exists radiation_readings jsonb;
alter table service_records add column if not exists survey_meter_model text;
alter table service_records add column if not exists survey_meter_serial text;
alter table service_records add column if not exists survey_meter_calibration_date date;
alter table service_records add column if not exists report_reference_no text;

-- Training Report-specific field — free text, one attendee name per line.
alter table service_records add column if not exists training_attendees text;

-- RLS: the existing select policy only ever matched via asset_id, which
-- would silently hide any site-only (asset_id null) record from the
-- client organization that owns it. sites.organization_id is a direct,
-- not-null column (schema.sql), so this is a straightforward additional
-- OR clause rather than a new policy.
alter policy "read own org service records or all if staff" on service_records
  using (
    is_internal_staff()
    or asset_id in (select id from assets where organization_id = my_organization_id())
    or site_id in (select id from sites where organization_id = my_organization_id())
  );
