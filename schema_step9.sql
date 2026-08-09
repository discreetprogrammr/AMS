-- Step 9 — Work Orders module.
--
-- Reference-design note: the horizoncare-360 reference app's /work-orders
-- route is staff-only (its useClientRedirect() hook bounces any client-role
-- user back to their dashboard) — this is a maintenance-operations queue,
-- not a client-portal feature. So work_orders follows the same staff-only
-- RLS pattern as inventory_cycles (Step 5), not the shared
-- staff-manage-but-client-can-read pattern used by service_tickets.
--
-- Reuses the existing `ticket_priority` enum (low/medium/high) instead of
-- inventing a parallel priority type — same three-level scale, same badge
-- colors already wired up in StatusBadge.

create type work_order_status as enum ('open', 'in_progress', 'completed');
create type work_order_type as enum ('preventive', 'corrective', 'inspection', 'emergency');

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  task_title text not null,
  description text,
  work_type work_order_type not null default 'corrective',
  priority ticket_priority not null default 'medium',
  status work_order_status not null default 'open',
  lead_technician text,
  due_date date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger work_orders_audit after insert or update or delete on work_orders
  for each row execute function log_audit();

alter table work_orders enable row level security;

create policy "staff manage work orders" on work_orders
  for all using (is_internal_staff());
