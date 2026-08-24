-- Step 37: Self-service Edit Profile — let a signed-in user (staff or
-- client) update their own display name from inside the app, instead of
-- needing a manual `update profiles set full_name = ...` run in Supabase's
-- SQL Editor every time (as done by hand for the test client account
-- earlier).
--
-- schema.sql's existing profiles policies only cover SELECT ("read own
-- profile or all if staff") and staff-blanket "for all" — there is no
-- policy letting a regular user UPDATE their own row at all, so this adds
-- one. But RLS alone is the wrong tool to fully gate this: a `using (id =
-- auth.uid())` policy on UPDATE would let ANY signed-in user, via the
-- public anon key and a raw supabase-js call from the browser console
-- (bypassing the app's own form entirely), also rewrite their own `role` or
-- `organization_id` — i.e. self-promote to super_admin, or jump into
-- another org's data. RLS policies apply to *rows*, not *columns*, so they
-- can't stop that on their own.
--
-- The actual guard is a Postgres column-level GRANT, enforced independently
-- of RLS at the privilege-check stage (before RLS is even evaluated): the
-- `authenticated` role's blanket UPDATE grant on profiles (part of
-- Supabase's default per-table grants) is revoked and replaced with a grant
-- on just the `full_name` column. Any UPDATE statement — from the app or a
-- raw client call — that touches `role`, `organization_id`, or `id` is
-- rejected outright, regardless of which row it targets.
create policy "update own display name" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

revoke update on profiles from authenticated;
grant update (full_name) on profiles to authenticated;
