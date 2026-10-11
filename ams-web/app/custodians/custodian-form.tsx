"use client";

import { saveCustodian } from "./actions";
import { CUSTODIAN_STATUSES, type CustodianProfile } from "@/lib/custodians";

const inputClass =
  "mt-1 h-10 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none";
const labelClass = "block text-xs uppercase tracking-wide text-slate-500";

// Edit panel on a person's page. Changing the name renames them on every
// item and in the custodian history, so it asks first, and says so when the
// new name is someone who already exists (they are merged).
export function CustodianForm({
  originalName,
  itemCount,
  profile,
  otherNames,
  ready,
}: {
  originalName: string;
  itemCount: number;
  profile: CustodianProfile | null;
  otherNames: string[];
  ready: boolean;
}) {
  return (
    <form
      action={saveCustodian.bind(null, originalName)}
      onSubmit={(e) => {
        const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
        if (!name || name === originalName.trim()) return;
        const merge = otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase() && n.trim().toLowerCase() !== originalName.trim().toLowerCase());
        const message = merge
          ? `"${name}" already exists. Merge "${originalName}" into "${name}"? All ${itemCount} item${itemCount === 1 ? "" : "s"} and their history will show "${name}". This can't be undone.`
          : `Rename "${originalName}" to "${name}" on all ${itemCount} item${itemCount === 1 ? "" : "s"} and in their custodian history?`;
        if (!window.confirm(message)) e.preventDefault();
      }}
      className="mb-6 rounded-xl border border-hairline bg-surface p-5"
    >
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">Custodian details</h2>
      {!ready && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          Saving is not set up yet. Run schema_step51.sql in the Supabase SQL editor.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className={labelClass}>
          Name
          <input name="name" defaultValue={originalName} required maxLength={120} className={inputClass} />
          <span className="mt-1 block normal-case tracking-normal text-slate-500">
            Changing it renames them on all {itemCount} item{itemCount === 1 ? "" : "s"} and in the history.
          </span>
        </label>
        <label className={labelClass}>
          Job title
          <input name="job_title" defaultValue={profile?.job_title ?? ""} maxLength={120} className={inputClass} />
        </label>
        <label className={labelClass}>
          Department
          <input name="department" placeholder="Leave blank to keep each item's" maxLength={120} className={inputClass} />
          <span className="mt-1 block normal-case tracking-normal text-slate-500">
            Filling this sets it on all {itemCount} item{itemCount === 1 ? "" : "s"}.
          </span>
        </label>
        <label className={labelClass}>
          Work email
          <input name="email" type="email" defaultValue={profile?.email ?? ""} maxLength={200} className={inputClass} />
        </label>
        <label className={labelClass}>
          Phone
          <input name="phone" defaultValue={profile?.phone ?? ""} maxLength={60} className={inputClass} />
        </label>
        <label className={labelClass}>
          Employee number
          <input name="employee_no" defaultValue={profile?.employee_no ?? ""} maxLength={60} className={inputClass} />
        </label>
        <label className={labelClass}>
          Status
          <select name="status" defaultValue={profile?.status ?? "active"} className={inputClass}>
            {CUSTODIAN_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Notes
          <input name="notes" defaultValue={profile?.notes ?? ""} maxLength={1000} className={inputClass} />
        </label>
      </div>
      <button
        type="submit"
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
      >
        Save details
      </button>
    </form>
  );
}
