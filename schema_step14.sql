-- Step 14 — Fleet Map module.
--
-- Reference-design note: the reference's Fleet Map plots a hardcoded list
-- of 17 named Philippine airports/ports (SITE_DEFS), matched against a
-- free-text `assets.site` column by string. AMS already has real,
-- relational sites (organizations -> sites -> assets) instead of free-text
-- site names, so the map should plot AMS's actual client sites, not a
-- fictional demo deployment list. The only thing genuinely missing is
-- coordinates — this migration adds nullable lat/lng to the existing
-- `sites` table (Step 1) rather than introducing a parallel sites concept.
-- Sites without coordinates simply don't appear on the map yet; staff can
-- add them from the Clients page.

alter table sites
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;
