import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createGlobalTicket } from "../../assets/tickets-actions";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/tickets");
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, organizations(name)")
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
                  {asset.organizations?.name
                    ? `${asset.organizations.name} — `
                    : ""}
                  {asset.asset_tag}
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

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
          >
            Submit Request
          </button>
        </form>
      </div>
    </AppShell>
  );
}
