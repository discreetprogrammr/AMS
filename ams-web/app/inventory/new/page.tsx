import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { createInventoryCycle } from "../actions";

export default async function NewInventoryCyclePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff();

  const supabase = await createClient();

  const { data: sites } = await supabase
    .from("sites")
    .select("id, address, organizations(name)")
    .order("address");

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Start Inventory Cycle</h1>
      {searchParams?.error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <form
        action={createInventoryCycle}
        className="space-y-5 rounded-lg border border-slate-200 bg-white p-6"
      >
        <div>
          <label className="block text-sm font-medium">Site</label>
          <select
            name="site_id"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="" disabled>
              Select site…
            </option>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(sites ?? []).map((site: any) => (
              <option key={site.id} value={site.id}>
                {site.organizations?.name
                  ? `${site.organizations.name} — `
                  : ""}
                {site.address}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            A checklist item is created for every asset currently at this
            site.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium">Label</label>
          <input
            name="label"
            required
            placeholder="e.g. Annual Physical Inventory 2026"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="rounded bg-slate-900 px-5 py-2 text-white hover:bg-slate-700"
        >
          Start Cycle
        </button>
      </form>
    </div>
  );
}
