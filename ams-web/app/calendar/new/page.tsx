import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createCalendarEvent } from "../actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export default async function NewCalendarEventPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/calendar");
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, organizations(name)")
    .order("asset_tag");

  return (
    <AppShell profile={profile} title="Schedule Event">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form
          action={createCalendarEvent}
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
            <label className={labelClass}>Title</label>
            <input
              name="title"
              required
              placeholder="e.g. Annual Calibration"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Event Type</label>
              <select
                name="event_type"
                defaultValue="maintenance"
                className={inputClass}
              >
                <option value="calibration">Calibration</option>
                <option value="maintenance">Maintenance</option>
                <option value="firmware">Firmware</option>
                <option value="inspection">Inspection</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" name="event_date" required className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Optional detail for whoever's assigned…"
              className={inputClass}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Schedule Event
            </button>
            <Link
              href="/calendar"
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
