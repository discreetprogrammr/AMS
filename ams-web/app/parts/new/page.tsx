import Link from "next/link";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createPart } from "../actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export default async function NewPartPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/parts");
  const profile = await getProfile();

  return (
    <AppShell profile={profile} title="Add Part">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form
          action={createPart}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          <div>
            <label className={labelClass}>Part Name</label>
            <input
              name="name"
              required
              placeholder="e.g. X-ray Conveyor Belt"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>SKU / Part Number (optional)</label>
              <input name="sku" placeholder="e.g. RPX-BELT-04" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Category (optional)</label>
              <input
                name="category"
                placeholder="e.g. Consumable, Spare Part"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Quantity on Hand</label>
              <input
                name="quantity_on_hand"
                type="number"
                min="0"
                defaultValue={0}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Reorder At</label>
              <input
                name="reorder_level"
                type="number"
                min="0"
                defaultValue={0}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Unit</label>
              <input name="unit" defaultValue="pcs" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Unit Cost (optional, ₱)</label>
            <input
              name="unit_cost"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 1500.00"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Supplier, storage location, anything worth noting…"
              className={inputClass}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Add Part
            </button>
            <Link
              href="/parts"
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
