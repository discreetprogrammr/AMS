import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createGlobalTicket } from "../../assets/tickets-actions";

// Client-visible, same as /tickets and /messages — a client_viewer needs a
// way to raise a new service request too, not just staff on a client's
// behalf. No extra filtering needed here: RLS ("read own org assets or
// all if staff", schema.sql) already scopes the asset dropdown below to
// just the signed-in org for a client, and the insert itself is covered
// by "clients can raise tickets on own assets" — so even a tampered
// asset_id in the submitted form would be rejected at the database level.
export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, serial_number, sites(address), organizations(name)")
    .order("asset_tag");

  return (
    <AppShell profile={profile} title="Request New Service">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form
          action={createGlobalTicket}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Asset
            </label>
            <select
              name="asset_id"
              required
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
            >
              <option value="" disabled>
                Select asset…
              </option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(assets ?? []).map((asset: any) => (
                <option key={asset.id} value={asset.id}>
                  {[asset.organizations?.name, asset.sites?.address]
                    .filter(Boolean)
                    .join(" — ")}
                  {asset.serial_number ? ` · SN ${asset.serial_number}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Description
            </label>
            <textarea
              name="description"
              required
              rows={4}
              placeholder="Describe the issue or service needed…"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Priority
            </label>
            <select
              name="priority"
              defaultValue="medium"
              className="mt-1 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Submit Request
            </button>
            <Link
              href="/tickets"
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
