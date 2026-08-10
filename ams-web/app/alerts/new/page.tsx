import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createAlert } from "../actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export default async function NewAlertPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/alerts");
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, organizations(name)")
    .order("asset_tag");

  return (
    <AppShell profile={profile} title="Log Alert">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form
          action={createAlert}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          <div>
            <label className={labelClass}>Title</label>
            <input
              name="title"
              required
              placeholder="e.g. Uptime below SLA threshold"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              name="description"
              rows={3}
              placeholder="What happened, and any context worth logging…"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Severity</label>
              <select
                name="severity"
                defaultValue="caution"
                className={inputClass}
              >
                <option value="critical">Critical</option>
                <option value="caution">Caution</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Related Asset (optional)</label>
              <select name="asset_id" defaultValue="" className={inputClass}>
                <option value="">No specific asset</option>
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
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Log Alert
            </button>
            <Link
              href="/alerts"
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
