import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { AlertsFeed, type AlertRow } from "./alerts-feed";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: { created?: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: alerts, error } = await supabase
    .from("alerts")
    .select(
      "id, title, description, severity, is_read, resolved_at, created_at, assets(serial_number, sites(address), organizations(name))",
    )
    .order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: AlertRow[] = (alerts ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    severity: a.severity,
    is_read: a.is_read,
    resolved_at: a.resolved_at,
    created_at: a.created_at,
    site_address: a.assets?.sites?.address ?? null,
    serial_number: a.assets?.serial_number ?? null,
    organization_name: a.assets?.organizations?.name ?? null,
  }));

  return (
    <AppShell
      profile={profile}
      title="Alerts"
      subtitle="Monitoring feed of critical, caution, and info events across the fleet."
      actions={
        <Link
          href="/alerts/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          + Log Alert
        </Link>
      }
    >
      {searchParams?.created === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Alert logged.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}
      <AlertsFeed alerts={rows} />
    </AppShell>
  );
}
