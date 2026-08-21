-- Step 35: Document library per asset — manuals, datasheets, and compliance
-- paperwork (e.g. PNRI documentation) a client can pull up themselves
-- instead of raising a ticket or calling in to ask for it. Staff curate the
-- library (upload/delete); a client can browse and download whatever's on
-- file for their own org's assets — same "staff manage, client reads own
-- org" split already used for compliance_certificates (schema.sql).
--
-- Storage bucket + RLS follow the exact same private-bucket pattern as
-- service-reports (schema_step20.sql) and chat-attachments
-- (schema_step27.sql): a private bucket, staff get a blanket manage policy,
-- and a client's read access is scoped by joining back to `assets` (here)
-- via a path-prefix check, since the object's own name IS the asset id
-- (see lib/documents.ts's makeDocumentPath — {asset_id}/{random}-{name}).
--
-- Run this once in the Supabase SQL editor (after schema_step34.sql).

create table asset_documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  category text not null default 'other'
    check (category in ('manual', 'datasheet', 'compliance', 'other')),
  title text not null,
  file_name text not null,
  file_path text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create trigger asset_documents_audit after insert or update or delete on asset_documents
  for each row execute function log_audit();

alter table asset_documents enable row level security;

create policy "read own org asset documents" on asset_documents
  for select using (
    is_internal_staff()
    or asset_id in (select id from assets where organization_id = my_organization_id())
  );

create policy "staff manage asset documents" on asset_documents
  for all using (is_internal_staff()) with check (is_internal_staff());

insert into storage.buckets (id, name, public)
values ('asset-documents', 'asset-documents', false)
on conflict (id) do nothing;

create policy "staff manage asset document files" on storage.objects
  for all
  using (bucket_id = 'asset-documents' and is_internal_staff())
  with check (bucket_id = 'asset-documents' and is_internal_staff());

create policy "read own org asset document files" on storage.objects
  for select
  using (
    bucket_id = 'asset-documents'
    and (storage.foldername(name))[1]::uuid in (
      select id from assets where organization_id = my_organization_id()
    )
  );
