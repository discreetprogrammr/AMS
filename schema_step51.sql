-- Step 51: Custodian details and rename [idempotent]. The Custodians tab
-- groups equipment by the custodian name typed on each item, so a person had
-- no details of their own and a misspelt or duplicated name could only be
-- fixed one item at a time. This step adds:
--   1. equipment_custodians: optional details per person (job title, email,
--      phone, employee number, active / left the company, notes), matched to
--      items by name (name_key = lower-cased, trimmed name).
--   2. rename_custodian(old, new, department): changes the custodian name on
--      all of that person's internal items, and in their custodian history,
--      in one transaction. Optionally sets the department on those items.
--      If the new name is someone who already exists, the two are merged.
--   3. log_asset_custodian_change() redefined to stand aside while a rename
--      is running, so a rename is not recorded as a handover (it is the same
--      person, spelt differently). Otherwise identical to step 48.
--
-- Internal equipment only: the function touches assets of internal
-- organizations and nothing else, and refuses anyone who is not staff. Safe
-- to run more than once.

create table if not exists equipment_custodians (
  id uuid primary key default gen_random_uuid(),
  name_key text not null unique,
  name text not null,
  job_title text,
  email text,
  phone text,
  employee_no text,
  status text not null default 'active' check (status in ('active', 'left')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table equipment_custodians enable row level security;
grant select, insert, update, delete on equipment_custodians to authenticated;

drop policy if exists "staff manage equipment custodians" on equipment_custodians;
create policy "staff manage equipment custodians" on equipment_custodians
  for all using (is_internal_staff()) with check (is_internal_staff());

-- Same as step 48, plus the rename flag.
create or replace function log_asset_custodian_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  org_is_internal boolean;
  new_custodian text := nullif(btrim(coalesce(NEW.custodian, '')), '');
  old_custodian text := case when TG_OP = 'UPDATE' then nullif(btrim(coalesce(OLD.custodian, '')), '') else null end;
begin
  if coalesce(current_setting('app.custodian_rename', true), '') = '1' then
    return NEW;
  end if;
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

create or replace function rename_custodian(p_old text, p_new text, p_department text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  old_key text := lower(btrim(coalesce(p_old, '')));
  new_name text := btrim(coalesce(p_new, ''));
  new_key text := lower(btrim(coalesce(p_new, '')));
  new_department text := nullif(btrim(coalesce(p_department, '')), '');
  asset_ids uuid[];
  n_assets int := 0;
  n_history int := 0;
begin
  if not is_internal_staff() then
    raise exception 'Not allowed';
  end if;
  if old_key = '' or new_name = '' then
    raise exception 'A name is required';
  end if;

  select coalesce(array_agg(a.id), '{}') into asset_ids
  from assets a
  join organizations o on o.id = a.organization_id
  where o.is_internal
    and lower(btrim(coalesce(a.custodian, ''))) = old_key;

  -- Local to this transaction: tells log_asset_custodian_change() to stand aside.
  perform set_config('app.custodian_rename', '1', true);

  update assets
    set custodian = new_name,
        department = coalesce(new_department, department),
        updated_at = now()
    where id = any(asset_ids);
  get diagnostics n_assets = row_count;

  update asset_custodian_history
    set custodian = new_name
    where asset_id = any(asset_ids)
      and lower(btrim(custodian)) = old_key;
  get diagnostics n_history = row_count;

  perform set_config('app.custodian_rename', '', true);

  -- The person's details follow the name; if the new name already has a
  -- profile the two are merged (the existing one wins, blanks are filled in).
  if old_key <> new_key then
    if exists (select 1 from equipment_custodians where name_key = new_key) then
      update equipment_custodians t
        set job_title = coalesce(t.job_title, o.job_title),
            email = coalesce(t.email, o.email),
            phone = coalesce(t.phone, o.phone),
            employee_no = coalesce(t.employee_no, o.employee_no),
            notes = coalesce(t.notes, o.notes),
            updated_at = now()
        from equipment_custodians o
        where t.name_key = new_key and o.name_key = old_key;
      delete from equipment_custodians where name_key = old_key;
    else
      update equipment_custodians
        set name = new_name, name_key = new_key, updated_at = now()
        where name_key = old_key;
    end if;
  else
    update equipment_custodians set name = new_name, updated_at = now() where name_key = old_key;
  end if;

  return jsonb_build_object('assets', n_assets, 'history', n_history);
end;
$$;

revoke all on function rename_custodian(text, text, text) from public;
grant execute on function rename_custodian(text, text, text) to authenticated;
