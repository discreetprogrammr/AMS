import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";

export default async function InventoryPage() {
  const profile = await getProfile();
  if (profile?.role !== "internal_staff") {
    redirect("/assets");
  }

  const supabase = await createClient();

  const { data: cycles, error } = await supabase
    .from("inventory_cycles")
    .select(
      "id, label, status, started_at, completed_at, sites(address, organizations(name))",
    )
    .order("started_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory Cycles</h1>
          <p className="text-sm text-slate-500">
            COA-style physical inventory counts, per site.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Dashboard
          </Link>
          <Link
            href="/inventory/new"
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            + Start Cycle
          </Link>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Completed</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {cycles?.map((cycle: any) => (
              <tr
                key={cycle.id}
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/inventory/${cycle.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {cycle.label}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {cycle.sites?.organizations?.name
                    ? `${cycle.sites.organizations.name} — `
                    : ""}
                  {cycle.sites?.address ?? "—"}
                </td>
                <td className="px-4 py-3 capitalize">{cycle.status}</td>
                <td className="px-4 py-3">
                  {new Date(cycle.started_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {cycle.completed_at
                    ? new Date(cycle.completed_at).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
            {cycles?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No inventory cycles yet. Click &ldquo;Start Cycle&rdquo; to
                  begin one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
