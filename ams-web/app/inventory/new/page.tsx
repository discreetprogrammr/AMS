import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createInventoryCycle } from "../actions";

export default async function NewInventoryCyclePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: sites } = await supabase
    .from("sites")
    .select("id, address, organizations(name)")
    .order("address");

  return (
    <AppShell profile={profile} title="Start Inventory Cycle">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form
          action={createInventoryCycle}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Site
            </label>
            <select
              name="site_id"
              required
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
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
            <p className="mt-1 text-xs text-slate-500">
              A checklist item is created for every asset currently at this
              site.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Label
            </label>
            <input
              name="label"
              required
              placeholder="e.g. Annual Physical Inventory 2026"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Start Cycle
            </button>
            <Link
              href="/inventory"
              className="rounded-lg border border-hairline px-5 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
