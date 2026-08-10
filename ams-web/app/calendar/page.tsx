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
  const { data: events, error } = await supabase
    .from("calendar_events")
    .select(
      "id, title, event_type, event_date, status, notes, assets(asset_tag, organizations(name))",
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
    asset_tag: e.assets?.asset_tag ?? null,
    organization_name: e.assets?.organizations?.name ?? null,
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
