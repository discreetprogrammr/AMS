import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { verifyItem, unverifyItem, completeCycle } from "../actions";

export default async function InventoryCycleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const [{ data: cycle }, { data: items }] = await Promise.all([
    supabase
      .from("inventory_cycles")
      .select("id, label, status, started_at, completed_at, sites(address, organizations(name))")
      .eq("id", params.id)
      .single(),
    supabase
      .from("inventory_cycle_items")
      .select(
        "id, verified, verified_at, condition_notes, assets(id, asset_tag, equipment_type, brand, model, status)",
      )
      .eq("inventory_cycle_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  if (!cycle) notFound();

  const total = items?.length ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verifiedCount = items?.filter((i: any) => i.verified).length ?? 0;
  const isOpen = cycle.status === "open";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cycleSite = cycle.sites as any;
  const orgPrefix = cycleSite?.organizations?.name
    ? `${cycleSite.organizations.name} — `
    : "";
  const startedLabel = new Date(cycle.started_at).toLocaleDateString();
  const completedLabel = cycle.completed_at
    ? ` · Completed ${new Date(cycle.completed_at).toLocaleDateString()}`
    : "";
  const subtitle = `${orgPrefix}${cycleSite?.address ?? "—"} · Started ${startedLabel}${completedLabel}`;

  return (
    <AppShell profile={profile} title={cycle.label} subtitle={subtitle}
      actions={
        <>
          <Link
            href="/inventory"
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            ← Back
          </Link>
          <a
            href={`/api/inventory/${cycle.id}/export`}
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Export Reconciliation
          </a>
          {isOpen && (
            <form action={completeCycle.bind(null, cycle.id)}>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
              >
                Complete Cycle
              </button>
            </form>
          )}
        </>
      }
    >
      <div className="mb-4 rounded-xl border border-hairline bg-surface p-4">
        <p className="text-sm text-ink-soft">
          <span className="font-semibold text-ink">{verifiedCount}</span> of{" "}
          <span className="font-semibold text-ink">{total}</span> assets
          verified
          {total > verifiedCount && isOpen ? (
            <span className="text-amber-400"> — {total - verifiedCount} pending</span>
          ) : null}
          {!isOpen && total > verifiedCount ? (
            <span className="text-red-400">
              {" "}
              — {total - verifiedCount} unverified at close (discrepancies)
            </span>
          ) : null}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3">Notes / Action</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {items?.map((item: any) => (
              <tr key={item.id} className="border-t border-hairline">
                <td className="px-4 py-3">
                  <Link
                    href={`/assets/${item.assets?.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {item.assets?.asset_tag ?? "—"}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {[item.assets?.brand, item.assets?.model]
                      .filter(Boolean)
                      .join(" / ")}
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-ink-soft">
                  {String(item.assets?.status ?? "").replace("_", " ")}
                </td>
                <td className="px-4 py-3">
                  {item.verified ? (
                    <span className="font-medium text-emerald-400">
                      ✓{" "}
                      {item.verified_at
                        ? new Date(item.verified_at).toLocaleDateString()
                        : ""}
                    </span>
                  ) : (
                    <span className="text-slate-500">Pending</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {item.verified ? (
                    <div className="flex items-center gap-3">
                      <span className="text-ink-soft">
                        {item.condition_notes || "—"}
                      </span>
                      {isOpen && (
                        <form action={unverifyItem.bind(null, cycle.id, item.id)}>
                          <button
                            type="submit"
                            className="text-xs text-slate-500 underline hover:text-ink-soft"
                          >
                            Undo
                          </button>
                        </form>
                      )}
                    </div>
                  ) : isOpen ? (
                    <form
                      action={verifyItem.bind(null, cycle.id, item.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        name="condition_notes"
                        placeholder="Condition notes (optional)"
                        className="w-48 rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-ink hover:bg-blue-500"
                      >
                        Mark Verified
                      </button>
                    </form>
                  ) : (
                    <span className="text-red-400">Not verified</span>
                  )}
                </td>
              </tr>
            ))}
            {items?.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No assets were on file at this site when the cycle started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
