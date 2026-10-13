"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addInternalCustodian } from "./custodian-actions";

// Custodian combobox for the internal asset form: type to search the list,
// pick a name, or add someone new through a small dialog. The chosen name is
// posted as `custodian`; the server checks it is on the list
// (assertKnownCustodian in actions.ts). A legacy value the item already has
// is always offered, so editing never blanks it.
export function CustodianSelect({
  names,
  defaultValue,
  className,
}: {
  names: string[];
  defaultValue: string | null;
  className: string;
}) {
  const current = (defaultValue ?? "").trim();
  const [list, setList] = useState<string[]>(() => {
    const base = current && !names.some((n) => n.toLowerCase() === current.toLowerCase()) ? [current, ...names] : names;
    return [...base].sort((a, b) => a.localeCompare(b));
  });
  const [value, setValue] = useState(current);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((n) => n.toLowerCase().includes(q)) : list;
  }, [list, query]);

  const choose = (name: string) => {
    setValue(name);
    setQuery("");
    setOpen(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await addInternalCustodian(newName);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setList((prev) =>
      prev.some((n) => n.toLowerCase() === result.name.toLowerCase())
        ? prev
        : [...prev, result.name].sort((a, b) => a.localeCompare(b)),
    );
    choose(result.name);
    setAdding(false);
    setNewName("");
  };

  const itemClass = "block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-hover";

  return (
    <div ref={box} className="relative">
      <input type="hidden" name="custodian" value={value} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="custodian-options"
        aria-label="Custodian"
        autoComplete="off"
        placeholder="No custodian: type to search"
        value={open ? query : value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (shown.length === 1) choose(shown[0]);
          }
        }}
        className={className}
      />
      {open && (
        <div id="custodian-options" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-hairline-strong bg-surface shadow-lg">
          <button type="button" className={`${itemClass} text-ink-soft`} onClick={() => choose("")}>
            No custodian
          </button>
          {shown.map((n) => (
            <button key={n} type="button" className={itemClass} onClick={() => choose(n)}>
              {n}
            </button>
          ))}
          {shown.length === 0 && <p className="px-3 py-2 text-sm text-ink-soft">No match.</p>}
          <button
            type="button"
            className={`${itemClass} border-t border-hairline font-medium`}
            onClick={() => {
              setNewName(query);
              setOpen(false);
              setAdding(true);
            }}
          >
            + Add new custodian
          </button>
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/70 p-4" role="dialog" aria-modal="true" aria-label="Add new custodian">
          <div className="w-full max-w-sm rounded-xl border border-hairline-strong bg-surface p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-semibold text-ink">Add new custodian</h3>
            <input
              autoFocus
              value={newName}
              maxLength={100}
              placeholder="Full name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!saving) void save();
                }
              }}
              className={className}
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
