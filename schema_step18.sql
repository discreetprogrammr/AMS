-- Step 18 — Customer survey + digital signature on service reports.
--
-- Matches the reference's PM checklist sign-off block (CSAT ratings +
-- SignaturePad), added to both the Preventive and Corrective Maintenance
-- report forms. Signatures are stored as PNG data URLs directly in a text
-- column rather than Supabase Storage — service_records.report_url already
-- exists for a future real file-storage path, but wiring up a signed
-- storage bucket needs a service-role key this sandbox doesn't have.
-- Data-URL signatures (a few KB of base64 each) are well within Postgres's
-- text column limits and need no extra setup to work today.

alter table service_records
  add column if not exists csat_service smallint,
  add column if not exists csat_machine smallint,
  add column if not exists csat_support smallint,
  add column if not exists csat_overall smallint,
  add column if not exists customer_signatory text,
  add column if not exists technician_signature text,
  add column if not exists customer_signature text;
