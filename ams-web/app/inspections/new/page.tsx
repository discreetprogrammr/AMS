import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createInspection } from "../actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/inspections");
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, organizations(name)")
    .order("asset_tag");

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell profile={profile} title="New Inspection">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form
          action={createInspection}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          <div>
            <label className={labelClass}>Asset</label>
            <select name="asset_id" required className={inputClass}>
              <option value="" disabled>
                Select asset…
              </option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(assets ?? []).map((asset: any) => (
                <option key={asset.id} value={asset.id}>
                  {asset.organizations?.name
                    ? `${asset.organizations.name} — `
                    : ""}
                  {asset.asset_tag}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Technician</label>
            <input name="technician_name" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Inspection Date</label>
            <input
              type="date"
              name="inspection_date"
              defaultValue={today}
              className={inputClass}
            />
          </div>

          <p className="text-xs text-slate-500">
            A standard 12-point checklist (Exterior &amp; Safety, Imaging
            &amp; Detection, System &amp; Software) is created automatically
            — every item starts as Pass and can be flagged during the
            walkthrough.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Start Inspection
            </button>
            <Link
              href="/inspections"
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
