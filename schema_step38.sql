-- Step 38: Profile pictures — lets the initials circle in the sidebar (and
-- My Profile, schema_step37.sql) be replaced with an actual photo, same
-- self-service model as the display name: a user manages only their own.
--
-- Run this once in the Supabase SQL editor (after schema_step37.sql).

alter table profiles add column avatar_url text;

-- Additive to schema_step37.sql's `grant update (full_name) on profiles to
-- authenticated` — Postgres column grants stack, this doesn't replace that
-- one. Still no grant on role/organization_id/id, for the same reason
-- schema_step37.sql explains: RLS governs rows, not columns, so the column
-- grant is what actually stops a client from rewriting their own role via a
-- raw client call.
grant update (avatar_url) on profiles to authenticated;

-- Public bucket, unlike every other Storage bucket in this project
-- (asset-documents, chat-attachments, service-reports) which are private
-- with an RLS-gated download route. A profile picture isn't sensitive
-- business data the way compliance paperwork or a chat photo is — it's
-- decorative UI shown on nearly every page load (the sidebar), so a public
-- URL avoids needing a signed-URL round trip just to render an avatar.
-- Reads bypass RLS entirely for a public bucket; the RLS policies below
-- only gate writes (insert/update/delete), each scoped to the caller's own
-- folder via the object path convention {user_id}/{random}-{filename}
-- (lib/avatar.ts's makeAvatarPath), same storage.foldername(name) pattern
-- schema_step35.sql uses for asset-documents.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar images are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "users can upload own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can replace own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can delete own avatar" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
