"use client";

import { useState, useTransition } from "react";
import {
  applyHrAdminPreset,
  applyInternalEquipmentPreset,
  removeHrAdminPreset,
  updateHiddenModules,
} from "./actions";
import { modulesForRole } from "@/lib/nav-items";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";

export type UserAccessRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "client_viewer";
  organization_name: string | null;
  hidden_modules: string[];
};

export function UserAccessList({ rows }: { rows: UserAccessRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const staffRows = rows.filter((r) => r.role === "admin");
  const clientRows = rows.filter((r) => r.role === "client_viewer");

  return (
    <div className="space-y-8">
      <UserGroup
        title="Staff"
        rows={staffRows}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
      />
      <UserGroup
        title="Clients"
        rows={clientRows}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
      />
    </div>
  );
}

function UserGroup({
  title,
  rows,
  expandedId,
  onToggle,
}: {
  title: string;
  rows: UserAccessRow[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-surface p-6 text-sm text-slate-500">
          No {title.toLowerCase()} accounts found.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <UserRow key={r.id} row={r} expanded={expandedId === r.id} onToggle={() => onToggle(r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UserRow({
  row,
  expanded,
  onToggle,
}: {
  row: UserAccessRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isStaff = row.role === "admin";
  // Super Admin accounts never show up in `rows` at all (excluded on the
  // server, app/user-access/page.tsx) — false here is always correct.
  const applicable = modulesForRole(isStaff, false);

  const [hidden, setHidden] = useState<Set<string>>(() => new Set(row.hidden_modules));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle(href: string) {
    setSaved(false);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      await updateHiddenModules(row.id, Array.from(hidden));
      setSaved(true);
    });
  }

  // Writes immediately (not just fills the checkboxes), then syncs local
  // state to what was stored so further tick/untick + Save works as usual.
  function handlePreset() {
    startTransition(async () => {
      const stored = await applyInternalEquipmentPreset(row.id);
      setHidden(new Set(stored));
      setSaved(true);
    });
  }

  // HR & Admin preset: set and removed as a whole. Its checkboxes are not
  // shown, so a stray tick cannot half-undo it.
  const [hrPreset, setHrPreset] = useState(() => isHrAdminPreset(row.hidden_modules));

  function handleHrPreset() {
    startTransition(async () => {
      await applyHrAdminPreset(row.id);
      setHrPreset(true);
      setSaved(true);
    });
  }

  function handleRemoveHrPreset() {
    startTransition(async () => {
      await removeHrAdminPreset(row.id);
      setHrPreset(false);
      setHidden(new Set());
      setSaved(true);
    });
  }

  const hiddenCount = row.hidden_modules.length;

  return (
    <li className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-surface-2"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{row.full_name ?? "Unnamed user"}</p>
          <p className="truncate text-xs text-slate-500">
            {row.email ?? "—"}
            {row.organization_name ? ` · ${row.organization_name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hrPreset && (
            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-400">
              HR &amp; Admin
            </span>
          )}
          {!hrPreset && hiddenCount > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-400">
              {hiddenCount} hidden
            </span>
          )}
          <span className="text-xs text-slate-500">{expanded ? "Hide" : "Edit Access"}</span>
        </div>
      </button>

      {expanded && hrPreset && (
        <div className="border-t border-hairline px-5 py-4">
          <p className="text-xs text-slate-500">
            HR &amp; Admin (internal equipment): this person sees Dashboard (their own internal-equipment
            dashboard) and Assets only, and can add, edit and delete internal equipment only.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleRemoveHrPreset}
              className="rounded-lg border border-hairline-strong px-4 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-hover disabled:opacity-50"
            >
              Remove HR &amp; Admin preset
            </button>
            {saved && !isPending && <span className="text-xs text-emerald-400">Saved.</span>}
          </div>
        </div>
      )}

      {expanded && !hrPreset && (
        <div className="border-t border-hairline px-5 py-4">
          <p className="mb-3 text-xs text-slate-500">
            Unchecking a module removes it from this person&apos;s sidebar and blocks them from opening it
            directly — they&apos;ll be redirected to the Dashboard if they try.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {applicable.map((m) => (
              <label key={m.href} className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" checked={!hidden.has(m.href)} onChange={() => toggle(m.href)} />
                {m.label}
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSave}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-ink hover:bg-blue-500 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handlePreset}
              title="Hides every client-facing and field-service module, leaving Dashboard, Assets, Scan Asset, Asset Verification and Alerts. Saves immediately."
              className="rounded-lg border border-hairline-strong px-4 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-hover disabled:opacity-50"
            >
              Internal equipment only
            </button>
            {isStaff && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleHrPreset}
                title="Dashboard (their own internal-equipment dashboard) and Assets only; internal equipment only. Saves immediately."
                className="rounded-lg border border-hairline-strong px-4 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-hover disabled:opacity-50"
              >
                HR &amp; Admin (internal equipment)
              </button>
            )}
            {saved && !isPending && <span className="text-xs text-emerald-400">Saved.</span>}
          </div>
        </div>
      )}
    </li>
  );
}
