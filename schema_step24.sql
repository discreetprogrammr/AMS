-- Step 24: scope client@horizoncare360.com to the "Bureau of Customs"
-- organization, so their Dashboard / Tickets / Reports show that org's
-- fleet data — and ONLY that org's data. Every RLS policy in this project
-- already enforces the "only your own org" boundary via
-- my_organization_id() (which just reads profiles.organization_id) — the
-- reason nothing showed up before is almost certainly that this account's
-- organization_id was never set (or the profiles row didn't exist yet),
-- not a missing policy.
--
-- STEP 1 — run this first to get the exact organization id/name. Eyeball
-- the result and copy the id (or fix the name filter below) before
-- running Step 2.
select id, name from organizations order by name;

-- STEP 2 — upsert the profile. Adjust the `ilike` filter below if the
-- organization's name in your Step 1 result isn't close to "Bureau of
-- Customs" (e.g. it might be exactly "Bureau of Customs - Demo" or
-- similar — ilike with wildcards on both sides matches regardless).
--
-- client@horizoncare360.com must already exist as a Supabase Auth user
-- (Dashboard → Authentication → Add user) before this runs — same
-- requirement as gsc@phtek.com.ph in schema_step23.sql.
insert into profiles (id, full_name, role, organization_id)
select
  u.id,
  'Bureau of Customs',
  'client_viewer',
  (select id from organizations where name ilike '%bureau of customs%' limit 1)
from auth.users u
where u.email = 'client@horizoncare360.com'
on conflict (id) do update
  set role = 'client_viewer',
      organization_id = excluded.organization_id;

-- STEP 3 (optional sanity check) — confirm it took.
select p.id, p.full_name, p.role, o.name as organization
from profiles p
left join organizations o on o.id = p.organization_id
join auth.users u on u.id = p.id
where u.email = 'client@horizoncare360.com';
