import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createWorkOrder } from "../actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/work-orders");
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, organizations(name)")
    .order("asset_tag");

  return (
    <AppShell profile={profile} title="Create Work Order">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form
          action={createWorkOrder}
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
            <label className={labelClass}>Task Title</label>
            <input
              name="task_title"
              required
              placeholder="e.g. Calibration Service"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              name="description"
              rows={3}
              placeholder="Additional detail for the assigned technician…"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Work Type</label>
              <select
                name="work_type"
                defaultValue="corrective"
                className={inputClass}
              >
                <option value="preventive">Preventive</option>
                <option value="corrective">Corrective</option>
                <option value="inspection">Inspection</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <select
                name="priority"
                defaultValue="medium"
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Lead Technician</label>
              <input name="lead_technician" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Due Date</label>
              <input type="date" name="due_date" className={inputClass} />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
          >
            Create Work Order
          </button>
        </form>
      </div>
    </AppShell>
  );
}
