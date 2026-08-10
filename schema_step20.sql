-- Step 20 — Storage bucket for server-generated PM/CM report PDFs.
--
-- Bucket creation and its RLS policies are plain SQL (storage.buckets /
-- storage.objects are just tables under the hood), so this runs the same
-- way every other schema_stepN.sql does — no service-role key or Supabase
-- dashboard click-through needed, just the SQL editor.
--
-- Same read shape as service_records itself (schema.sql): staff see
-- every report; a client_viewer only sees PDFs for reports tied to their
-- own org's assets. report_url stores the exact object path used at
-- upload time, so this join mirrors the existing service_records policy.

insert into storage.buckets (id, name, public)
values ('service-reports', 'service-reports', false)
on conflict (id) do nothing;

create policy "staff manage service report pdfs" on storage.objects
  for all
  using (bucket_id = 'service-reports' and is_internal_staff())
  with check (bucket_id = 'service-reports' and is_internal_staff());

create policy "read own org service report pdfs" on storage.objects
  for select
  using (
    bucket_id = 'service-reports'
    and (
      is_internal_staff()
      or name in (
        select sr.report_url
        from service_records sr
        join assets a on a.id = sr.asset_id
        where a.organization_id = my_organization_id()
          and sr.report_url is not null
      )
    )
  );
