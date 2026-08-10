-- Step 23: assign the roles requested for the three accounts below. Run
-- this AFTER schema_step22.sql has fully committed (separate query/run —
-- see the note at the top of that file).
--
-- gsc@phtek.com.ph must already exist as a Supabase Auth user before this
-- runs (Dashboard → Authentication → Add user) — this only creates/updates
-- their `profiles` row, it doesn't create the auth account itself. If the
-- INSERT below inserts 0 rows, that's why: go create the auth user first,
-- then re-run just that statement.

-- lal@phtek.com.ph — Super Admin, sees every tab including Audit Log.
update profiles set role = 'super_admin'
where id = (select id from auth.users where email = 'lal@phtek.com.ph');

-- gsc@phtek.com.ph — new engineer account. Admin: every tab except Audit
-- Log. Creates the profiles row if it doesn't exist yet, or promotes it to
-- admin if it does.
insert into profiles (id, full_name, role)
select id, 'GSC', 'admin'
from auth.users
where email = 'gsc@phtek.com.ph'
on conflict (id) do update set role = 'admin';

-- client@horizoncare360.com — left as client_viewer (unchanged), included
-- here only so this file is a complete record of all three role
-- assignments. Uncomment if this account's profile row doesn't exist yet
-- or needs to be reset back to client_viewer.
-- update profiles set role = 'client_viewer'
-- where id = (select id from auth.users where email = 'client@horizoncare360.com');
