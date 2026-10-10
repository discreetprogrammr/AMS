-- Step 50: Photo, receipt and warranty categories for asset documents
-- [idempotent]. The document library (schema_step35.sql) only allowed
-- manual / datasheet / compliance / other. Internal equipment needs a photo
-- of the item, the purchase receipt or invoice, and the warranty card, so
-- three categories are added: photo, receipt, warranty. Existing rows are
-- untouched and stay valid. Client assets keep offering their original four
-- in the app; the app, not this constraint, decides which list a given asset
-- sees.
--
-- The constraint was created inline in step 35, so its name is looked up
-- rather than assumed. Safe to run more than once.

do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'asset_documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table asset_documents drop constraint %I', c);
  end loop;

  alter table asset_documents
    add constraint asset_documents_category_check
    check (category in ('manual', 'datasheet', 'compliance', 'other', 'photo', 'receipt', 'warranty'));
end
$$;
