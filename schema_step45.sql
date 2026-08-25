-- Step 45: Editable, movable, resizable Dashboard widgets — drag to
-- rearrange and drag the corner handle to resize, same mental model as
-- rearranging home-screen widgets on a phone.
--
-- Unlike hidden_modules (schema_step44.sql, deliberately Super-Admin-only
-- since it's an access-control decision made ABOUT someone else),
-- dashboard_layout is a personal display preference every signed-in user
-- sets for THEMSELVES — so this follows the full_name/avatar_url
-- self-service pattern (schema_step37/38.sql) instead: the existing
-- "update own display name" RLS policy (id = auth.uid()) already covers
-- any column once it's granted, so this just widens that grant list. No
-- new policy needed.
alter table profiles add column if not exists dashboard_layout jsonb;

grant update (dashboard_layout) on profiles to authenticated;
