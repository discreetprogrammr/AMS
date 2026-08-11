import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { CalendarView, type CalendarEventRow } from "./calendar-view";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { created?: string };
}) {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);

  // No requireStaff() gate here — unlike Work Orders/Alerts/Inspections,
  // Calendar is client-visible (see schema_step12.sql). RLS scopes a
  // client_viewer down to events on their own organization's assets.
  // work_orders(...) is a forward embed via calendar_events.work_order_id
  // (schema_step17.sql) — lets the click-through summary (item 9) show the
  // real Open/In Progress/Parts Pending/Closed status for events spawned
  // from an actual work order, instead of just the calendar's own generic
  // scheduled/completed/overdue.
  const { data: events, error } = await supabase
    .from("calendar_events")
    .select(
      "id, title, event_type, event_date, status, notes, asset_id, assets(serial_number, sites(address), organizations(name)), work_orders(status, task_title, description, lead_technician, priority)",
    )
    .order("event_date", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: CalendarEventRow[] = (events ?? []).map((e: any) => ({
    id: e.id,
    title: e.title,
    event_type: e.event_type,
    event_date: e.event_date,
    status: e.status,
    notes: e.notes,
    asset_id: e.asset_id ?? null,
    site_address: e.assets?.sites?.address ?? null,
    serial_number: e.assets?.serial_number ?? null,
    organization_name: e.assets?.organizations?.name ?? null,
    work_order: e.work_orders
      ? {
          status: e.work_orders.status,
          task_title: e.work_orders.task_title,
          description: e.work_orders.description,
          lead_technician: e.work_orders.lead_technician,
          priority: e.work_orders.priority,
        }
      : null,
  }));

  return (
    <AppShell
      profile={profile}
      title="Service Calendar"
      subtitle="Calibrations, maintenance, firmware, and inspection scheduling across the fleet."
      actions={
        isStaff ? (
          <Link
            href="/calendar/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
          >
            + Schedule Event
          </Link>
        ) : undefined
      }
    >
      {searchParams?.created === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Event scheduled.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}
      <CalendarView events={rows} isStaff={isStaff} />
    </AppShell>
  );
}
