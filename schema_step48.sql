-- Step 48: Custodian history for internal equipment [idempotent]. Changing
-- assets.custodian used to overwrite the old name, so there was no record of
-- who held an item before. This table keeps one row per holding: who, from
-- when, until when (ended_at is null = current holder).
--
-- Rows are written by a trigger on assets, so every write path is covered
-- (the app, the CSV load scripts, the SQL editor). Internal organizations
-- only; client assets are untouched. Nothing but the trigger writes the
-- table: staff can read it, and no insert/update/delete policy exists.
--
-- History is deleted with its asset (on delete cascade). The assets audit
-- trigger (log_audit) still records the asset itself. The HR & Admin delete
-- check does not count these rows, since every held item has some.
--
-- Safe to run more than once. The backfill only gives an opening row to
-- internal assets that have a custodian and no history yet.

create table if not exists asset_custodian_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  custodian text not null,
  department text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  changed_by uuid references profiles(id) on delete set null
);

create index if not exists asset_custodian_history_asset_idx
  on asset_custodian_history (asset_id, started_at desc);

-- At most one current holder per asset.
create unique index if not exists asset_custodian_history_one_open_idx
  on asset_custodian_history (asset_id) where ended_at is null;

alter table asset_custodian_history enable row level security;
grant select on asset_custodian_history to authenticated;

drop policy if exists "staff read custodian history" on asset_custodian_history;
create policy "staff read custodian history" on asset_custodian_history
  for select using (is_internal_staff());

create or replace function log_asset_custodian_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  org_is_internal boolean;
  new_custodian text := nullif(btrim(coalesce(NEW.custodian, '')), '');
  old_custodian text := case when TG_OP = 'UPDATE' then nullif(btrim(coalesce(OLD.custodian, '')), '') else null end;
begin
  select is_internal into org_is_internal from organizations where id = NEW.organization_id;
  if not coalesce(org_is_internal, false) then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and new_custodian is not distinct from old_custodian then
    return NEW;
  end if;

  update asset_custodian_history set ended_at = now()
    where asset_id = NEW.id and ended_at is null;

  if new_custodian is not null then
    insert into asset_custodian_history (asset_id, custodian, department, changed_by)
    values (NEW.id, new_custodian, NEW.department, auth.uid());
  end if;
  return NEW;
end;
$$;

drop trigger if exists assets_custodian_history on assets;
create trigger assets_custodian_history after insert or update of custodian on assets
  for each row execute function log_asset_custodian_change();

-- Opening row for internal assets that already have a custodian.
insert into asset_custodian_history (asset_id, custodian, department, started_at)
select a.id, btrim(a.custodian), a.department, coalesce(a.date_issued::timestamptz, a.created_at)
from assets a
join organizations o on o.id = a.organization_id
where o.is_internal
  and nullif(btrim(coalesce(a.custodian, '')), '') is not null
  and not exists (select 1 from asset_custodian_history h where h.asset_id = a.id);
