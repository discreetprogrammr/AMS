import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ticketRef } from "@/lib/format";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: { created?: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: tickets, error } = await supabase
    .from("service_tickets")
    .select(
      "id, description, status, priority, created_at, assets(id, asset_tag, organizations(name))",
    )
    .order("created_at", { ascending: false });

  return (
    <AppShell
      profile={profile}
      title="Ticket Queue"
      subtitle="All service tickets raised across clients and sites."
      actions={
        <Link
          href="/tickets/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          + Request New Service
        </Link>
      }
    >
      {searchParams?.created === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Service request submitted.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Ticket</th>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Raised</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {tickets?.map((t: any) => (
              <tr
                key={t.id}
                className="border-t border-hairline hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/assets/${t.assets?.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {ticketRef(t.id)}
                  </Link>
                  <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500">
                    {t.description}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {t.assets?.asset_tag ?? "—"}
                  {t.assets?.organizations?.name && (
                    <div className="text-xs text-slate-500">
                      {t.assets.organizations.name}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.priority} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {tickets?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No service tickets raised yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
