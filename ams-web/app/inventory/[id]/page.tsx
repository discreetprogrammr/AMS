import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { verifyItem, unverifyItem, completeCycle } from "../actions";

export default async function InventoryCycleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireStaff();

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

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-2">
        <Link
          href="/inventory"
          className="text-sm text-slate-500 hover:underline"
        >
          ← Back to Inventory Cycles
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{cycle.label}</h1>
          <p className="text-sm text-slate-500">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(cycle.sites as any)?.organizations?.name
              ? `${(cycle.sites as any).organizations.name} — `
              : ""}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(cycle.sites as any)?.address ?? "—"} · Started{" "}
            {new Date(cycle.started_at).toLocaleDateString()}
            {cycle.completed_at
              ? ` · Completed ${new Date(cycle.completed_at).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href={`/api/inventory/${cycle.id}/export`}
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Export Reconciliation
          </a>
          {isOpen && (
            <form action={completeCycle.bind(null, cycle.id)}>
              <button
                type="submit"
                className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
              >
                Complete Cycle
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm">
          <span className="font-semibold">{verifiedCount}</span> of{" "}
          <span className="font-semibold">{total}</span> assets verified
          {total > verifiedCount && isOpen ? (
            <span className="text-amber-600">
              {" "}
              — {total - verifiedCount} pending
            </span>
          ) : null}
          {!isOpen && total > verifiedCount ? (
            <span className="text-red-600">
              {" "}
              — {total - verifiedCount} unverified at close (discrepancies)
            </span>
          ) : null}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
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
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link
                    href={`/assets/${item.assets?.id}`}
                    className="font-medium hover:underline"
                  >
                    {item.assets?.asset_tag ?? "—"}
                  </Link>
                  <div className="text-xs text-slate-400">
                    {[item.assets?.brand, item.assets?.model]
                      .filter(Boolean)
                      .join(" / ")}
                  </div>
                </td>
                <td className="px-4 py-3 capitalize">
                  {String(item.assets?.status ?? "").replace("_", " ")}
                </td>
                <td className="px-4 py-3">
                  {item.verified ? (
                    <span className="font-medium text-green-700">
                      ✓{" "}
                      {item.verified_at
                        ? new Date(item.verified_at).toLocaleDateString()
                        : ""}
                    </span>
                  ) : (
                    <span className="text-slate-400">Pending</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {item.verified ? (
                    <div className="flex items-center gap-3">
                      <span className="text-slate-600">
                        {item.condition_notes || "—"}
                      </span>
                      {isOpen && (
                        <form action={unverifyItem.bind(null, cycle.id, item.id)}>
                          <button
                            type="submit"
                            className="text-xs text-slate-500 underline hover:text-slate-800"
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
                        className="w-48 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="whitespace-nowrap rounded bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700"
                      >
                        Mark Verified
                      </button>
                    </form>
                  ) : (
                    <span className="text-red-600">Not verified</span>
                  )}
                </td>
              </tr>
            ))}
            {items?.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No assets were on file at this site when the cycle started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
