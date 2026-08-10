-- Step 22 (part 1 of 2): widen user_role for the new 3-tier Super Admin /
-- Admin / Client system.
--
-- - 'internal_staff' is renamed to 'admin'. This is a rename, not a
--   drop-and-recreate — every existing internal-staff profile carries over
--   as 'admin' automatically, no UPDATE needed for that part.
-- - 'super_admin' is a brand-new value: same access as 'admin' everywhere,
--   PLUS the Audit Log page (Admin can see every tab except Audit Log).
-- - 'client_viewer' is unchanged.
--
-- Run ONLY this file first, and let it finish/commit, before running
-- schema_step22b.sql. Postgres refuses to let a brand-new enum value be
-- referenced anywhere — even inside a function body being defined — until
-- the ALTER TYPE that added it has actually committed (error 55P04,
-- "unsafe use of new value ... New enum values must be committed before
-- they can be used"). Pasting both files as one script hits that error, so
-- they're two separate files/runs on purpose.

alter type user_role rename value 'internal_staff' to 'admin';
alter type user_role add value if not exists 'super_admin' after 'admin';
