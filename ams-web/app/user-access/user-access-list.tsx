"use client";

import { useState, useTransition } from "react";
import { updateHiddenModules } from "./actions";
import { modulesForRole } from "@/lib/nav-items";

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
          {hiddenCount > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-400">
              {hiddenCount} hidden
            </span>
          )}
          <span className="text-xs text-slate-500">{expanded ? "Hide" : "Edit Access"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-hairline px-5 py-4">
          <p className="mb-3 text-xs text-slate-500">
            Unchecking a module removes it from this person&apos;s sidebar only — it doesn&apos;t change what
            they&apos;re allowed to do elsewhere in the app (data access is still enforced separately).
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
            {saved && !isPending && <span className="text-xs text-emerald-400">Saved.</span>}
          </div>
        </div>
      )}
    </li>
  );
}
