-- Step 42: Refine the four new report types (schema_step41.sql) against
-- Astrophysics' real XIS Installation/Radiation Survey, Site Survey, and
-- Training Record forms — provided as reference, not replicated field-for-
-- field. Most of what those forms capture either already fit into existing
-- generic fields, or gets composed into `findings` at submit time (same
-- technique app/reports/actions.ts already uses for Corrective reports'
-- fault/root-cause/action) — this migration only adds the handful of
-- fields that genuinely warranted their own column.

-- Radiation Survey Test: the real form's Radiation Meter block has a
-- Manufacturer field alongside Model/Serial/Cal Date (which schema_step41
-- already added) — this was the one meter field missing.
alter table service_records add column if not exists survey_meter_manufacturer text;

-- The real form records ambient/background radiation separately from the
-- per-point readings table (schema_step41's radiation_readings jsonb) —
-- a single reference reading taken before testing the unit itself.
alter table service_records add column if not exists background_radiation_reading text;

-- The real form's "Warning Label Verification" + "X-Ray ON Indicator" +
-- "Safety Devices and Interlocks" sections are all the same shape: a
-- required item, and whether it was found present/working ("Accepted").
-- One generic jsonb array covers all three sections rather than three
-- separate columns — same reasoning as radiation_readings.
alter table service_records add column if not exists safety_checklist jsonb;

-- Site Survey now uses a proper sectioned checklist (Receiving Area,
-- Access Path, Power & Space, Environment, Connectivity — condensed from
-- the real form's much longer question list) instead of one free-text
-- box, reusing the existing generic service_record_checklist_items table
-- (schema_step13.sql) rather than adding a new one — that table was never
-- actually specific to Preventive Maintenance, just only ever used by it
-- until now.
--
-- Its RLS select policy, however, WAS effectively PM-only in practice:
-- it inner-joins service_records to assets, so a checklist item on a
-- site-only report (asset_id null, per schema_step41.sql) would never
-- match for a client — the join produces zero rows. Site Survey is
-- exactly the report type most likely to have no asset yet, so this
-- would have silently hidden a client's own site-survey checklist from
-- them. Fixed with the same asset-or-site OR clause schema_step41.sql
-- already applied to service_records itself.
alter policy "read own org checklist items or all if staff" on service_record_checklist_items
  using (
    is_internal_staff()
    or service_record_id in (
      select sr.id from service_records sr
      where (sr.asset_id is not null and sr.asset_id in (
        select id from assets where organization_id = my_organization_id()
      ))
      or (sr.site_id is not null and sr.site_id in (
        select id from sites where organization_id = my_organization_id()
      ))
    )
  );
