-- Step 15: Widen asset_status to match Fleet Map's site-level categories
-- exactly — Operational / Attention / Down / Unserviceable — instead of the
-- original 3-value enum (operational / under_maintenance / unserviceable).
--
-- - 'operational' is unchanged.
-- - 'under_maintenance' is renamed to 'attention'. This is a rename, not a
--   drop-and-recreate — every existing row already holding that value
--   carries over automatically as part of the ALTER, no UPDATE needed.
-- - 'down' is a brand-new value with no historical equivalent. Previously
--   "temporarily out of service" and "beyond repair / write-off" were both
--   lumped into 'unserviceable'. This migration does NOT try to guess
--   which existing 'unserviceable' assets are actually just 'down' — they
--   stay 'unserviceable' as-is; reclassify individually from the Assets
--   page if a given asset is really just temporarily down. New/updated
--   assets going forward can pick whichever of the two actually applies.
--
-- Run this once in the Supabase SQL editor (after Steps 1–14).

alter type asset_status rename value 'under_maintenance' to 'attention';
alter type asset_status add value if not exists 'down' after 'attention';
