"use client";

import { useRef } from "react";
import { ASSIGNMENT_STATUSES, CONDITIONS } from "@/lib/internal-equipment";
import { bulkUpdateInternalAssets } from "./bulk-actions";

const inputClass =
  "h-9 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none";
const labelClass = "flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-500";

// Appears above the internal list while rows are ticked. Anything left
// blank / "Leave unchanged" is not touched; the server re-checks that every
// id is internal equipment (bulk-actions.ts).
export function BulkEditBar({
  ids,
  onClear,
}: {
  ids: string[];
  onClear: () => void;
}) {
  const backRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={bulkUpdateInternalAssets}
      onSubmit={(e) => {
        if (!window.confirm(`Update ${ids.length} item${ids.length === 1 ? "" : "s"}? Fields left blank stay as they are.`)) {
          e.preventDefault();
          return;
        }
        if (backRef.current) backRef.current.value = window.location.pathname + window.location.search;
      }}
      className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4"
    >
      <input type="hidden" name="back" ref={backRef} defaultValue="/assets" />
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          {ids.length} selected <span className="font-normal text-slate-500">· change several at once</span>
        </p>
        <button type="button" onClick={onClear} className="text-xs text-ink-soft hover:underline">
          Clear selection
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Custodian
          <input name="custodian" placeholder="Leave blank to keep" className={`${inputClass} w-48`} />
          <span className="flex items-center gap-1.5 normal-case tracking-normal text-slate-500">
            <input type="checkbox" name="clear_custodian" /> Clear custodian
          </span>
        </label>
        <label className={labelClass}>
          Department
          <input name="department" placeholder="Leave blank to keep" className={`${inputClass} w-48`} />
          <span className="flex items-center gap-1.5 normal-case tracking-normal text-slate-500">
            <input type="checkbox" name="clear_department" /> Clear department
          </span>
        </label>
        <label className={labelClass}>
          Status
          <select name="assignment_status" defaultValue="" className={inputClass}>
            <option value="">Leave unchanged</option>
            {ASSIGNMENT_STATUSES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Condition
          <select name="condition" defaultValue="" className={inputClass}>
            <option value="">Leave unchanged</option>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-ink hover:bg-blue-500"
        >
          Apply to {ids.length}
        </button>
      </div>
    </form>
  );
}
