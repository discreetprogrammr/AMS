-- Step 47: Unique internal asset tags [idempotent]. PR 3 of the internal
-- equipment register checks for a duplicate PHT-EQ-NNNN in the app only
-- (app/assets/actions.ts), so two simultaneous saves could both pass the
-- check and take the same number. This partial unique index closes that
-- race: Postgres refuses the second write, and the app turns the unique
-- violation (23505) into a friendly message.
--
-- Partial on purpose: client asset tags are not constrained and are
-- untouched. Safe to run more than once. If duplicate PHT-EQ- tags already
-- exist the statement fails and names them; fix those rows, then re-run.

create unique index if not exists assets_internal_asset_tag_key
  on assets (asset_tag) where asset_tag like 'PHT-EQ-%';
