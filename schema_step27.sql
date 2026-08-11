-- Step 27: File/photo attachments in chat — lets a client or staff member
-- attach a document or photo to a message on a ticket's thread (e.g. a
-- photo of the fault, a spec sheet, a signed form).
--
-- Design notes:
-- - No new table — an attachment is just a few extra nullable columns on
--   `messages` (schema_step25.sql). A message can carry a caption (body),
--   an attachment, or both; message_type stays 'text' either way (call
--   events never carry attachments).
-- - Storage bucket is private, same pattern as `service-reports`
--   (schema_step20.sql): a business-table join scopes staff to
--   everything and everyone else to their own org — except here it's a
--   path-prefix check instead of a join, because at upload time the
--   `messages` row doesn't exist yet to join against (the file has to
--   land in Storage before the row referencing it can be inserted).
--   Convention: every object is stored at `{ticket_id}/{random}-{name}`,
--   so `storage.foldername(name))[1]` is always the ticket id.
-- - Upload/download both happen directly from the browser (same as every
--   other part of chat — messages themselves are inserted client-side
--   too), relying on these RLS policies as the real access boundary
--   rather than a server route.
--
-- Run this once in the Supabase SQL editor (after schema_step26.sql).

alter table messages add column attachment_path text;
alter table messages add column attachment_name text;
alter table messages add column attachment_mime text;
alter table messages add column attachment_size bigint;

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

create policy "staff manage chat attachments" on storage.objects
  for all
  using (bucket_id = 'chat-attachments' and is_internal_staff())
  with check (bucket_id = 'chat-attachments' and is_internal_staff());

create policy "read own org chat attachments" on storage.objects
  for select
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1]::uuid in (
      select t.id from service_tickets t
      join assets a on a.id = t.asset_id
      where a.organization_id = my_organization_id()
    )
  );

create policy "upload own org chat attachments" on storage.objects
  for insert
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1]::uuid in (
      select t.id from service_tickets t
      join assets a on a.id = t.asset_id
      where a.organization_id = my_organization_id()
    )
  );
