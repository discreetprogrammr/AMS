import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { isSuperAdminRole } from "@/lib/supabase/roles";
import { AppShell } from "@/components/app-shell";
import { updateGlobalSlaPolicy, upsertOrgSlaPolicy, deleteOrgSlaPolicy } from "./actions";

// SLA Policy — schema_step40.sql. Readable by any staff (matches how
// everyone can already see SLA performance on the dashboard), but editing
// is Super Admin-only per explicit instruction: an SLA target is treated
// as closer to a contractual commitment than routine data entry, so it
// gets the same restricted-write tier as Audit Log.
export default async function SlaSettingsPage({
  searchParams,
}: {
  searchParams: { error?: string; updated?: string };
}) {
  const profile = await requireStaff();
  const canEdit = isSuperAdminRole(profile.role);

  const supabase = await createClient();

  const [{ data: policies }, { data: organizations }] = await Promise.all([
    supabase
      .from("sla_policies")
      .select("id, organization_id, is_global, response_target_hours, resolution_target_hours, updated_at"),
    supabase.from("organizations").select("id, name").order("name"),
  ]);

  const global = (policies ?? []).find((p) => p.is_global) ?? null;
  const overrides = (policies ?? []).filter((p) => !p.is_global);
  const overriddenOrgIds = new Set(overrides.map((o) => o.organization_id));
  const orgById = new Map((organizations ?? []).map((o) => [o.id, o.name]));
  const availableOrgs = (organizations ?? []).filter((o) => !overriddenOrgIds.has(o.id));

  return (
    <AppShell
      profile={profile}
      title="SLA Policy"
      subtitle={
        canEdit
          ? "Response and resolution targets used by SLA breach alerts and the dashboard."
          : "Response and resolution targets used by SLA breach alerts and the dashboard. Only Super Admins can edit these."
      }
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {searchParams?.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        {searchParams?.updated && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            {searchParams.updated === "removed" ? "Override removed." : "SLA policy updated."}
          </p>
        )}

        <div className="rounded-xl border border-hairline bg-surface p-6">
          <h2 className="text-sm font-semibold text-ink">Global Default</h2>
          <p className="mt-1 text-xs text-slate-500">
            Applies to every client without their own override below, and to the staff-wide dashboard/analytics
            view (which spans every client at once, so it always shows the global number rather than blending
            different clients' targets).
          </p>

          {canEdit ? (
            <form action={updateGlobalSlaPolicy} className="mt-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-soft">Response Target (hours)</label>
                <input
                  type="number"
                  name="response_target_hours"
                  min="0.5"
                  step="0.5"
                  required
                  defaultValue={global?.response_target_hours ?? 8}
                  className="mt-1 w-32 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft">Resolution Target (hours)</label>
                <input
                  type="number"
                  name="resolution_target_hours"
                  min="0.5"
                  step="0.5"
                  required
                  defaultValue={global?.resolution_target_hours ?? 48}
                  className="mt-1 w-32 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
              >
                Save
              </button>
            </form>
          ) : (
            <dl className="mt-4 flex gap-8 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Response Target</dt>
                <dd className="font-medium text-ink">{global?.response_target_hours ?? 8}h</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Resolution Target</dt>
                <dd className="font-medium text-ink">{global?.resolution_target_hours ?? 48}h</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-6">
          <h2 className="text-sm font-semibold text-ink">Per-Client Overrides</h2>
          <p className="mt-1 text-xs text-slate-500">
            A client with a different contracted SLA tier — their tickets escalate against these numbers instead
            of the global default, and their own dashboard/analytics show these targets too.
          </p>

          {overrides.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Client</th>
                    <th className="py-2 pr-3">Response</th>
                    <th className="py-2 pr-3">Resolution</th>
                    {canEdit && <th className="py-2 pr-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o) => (
                    <tr key={o.id} className="border-t border-hairline">
                      <td className="py-2 pr-3 text-ink">{orgById.get(o.organization_id) ?? "Unknown client"}</td>
                      <td className="py-2 pr-3 text-ink-soft">{o.response_target_hours}h</td>
                      <td className="py-2 pr-3 text-ink-soft">{o.resolution_target_hours}h</td>
                      {canEdit && (
                        <td className="py-2 pr-3 text-right">
                          <form action={deleteOrgSlaPolicy.bind(null, o.id)}>
                            <button type="submit" className="text-xs text-red-400 hover:underline">
                              Remove
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No per-client overrides yet — everyone uses the global default.</p>
          )}

          {canEdit && availableOrgs.length > 0 && (
            <form
              action={upsertOrgSlaPolicy}
              className="mt-5 flex flex-wrap items-end gap-4 border-t border-hairline pt-4"
            >
              <div>
                <label className="block text-xs font-medium text-ink-soft">Client</label>
                <select
                  name="organization_id"
                  required
                  className="mt-1 w-48 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
                >
                  <option value="" disabled>
                    Select client…
                  </option>
                  {availableOrgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft">Response (hours)</label>
                <input
                  type="number"
                  name="response_target_hours"
                  min="0.5"
                  step="0.5"
                  required
                  className="mt-1 w-28 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft">Resolution (hours)</label>
                <input
                  type="number"
                  name="resolution_target_hours"
                  min="0.5"
                  step="0.5"
                  required
                  className="mt-1 w-28 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
              >
                + Add Override
              </button>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}
