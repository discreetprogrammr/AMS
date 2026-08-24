"use client";

import { useState } from "react";
import Link from "next/link";
import {
  parsePartsImport,
  commitPartsImport,
  type PartImportPreview,
  type PartImportResult,
} from "./actions";

type Phase = "pick" | "preview" | "done";

export function ImportPartsForm() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PartImportPreview | null>(null);
  const [result, setResult] = useState<PartImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a CSV file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const p = await parsePartsImport(formData);
      setPreview(p);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const r = await commitPartsImport(preview.valid);
      setResult(r);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPhase("pick");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {phase === "pick" && (
        <form onSubmit={handleParse} className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
          <div>
            <label className="block text-sm font-medium text-ink-soft">CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-surface"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Up to 500 rows per file. Not sure of the format?{" "}
              <a href="/api/parts/import/template" className="text-blue-400 hover:underline">
                Download the template
              </a>
              .
            </p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Reading file…" : "Preview Import"}
          </button>
        </form>
      )}

      {phase === "preview" && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Will Import" value={preview.valid.length} tone="emerald" />
            <SummaryCard label="Skipped (duplicates)" value={preview.skipped.length} tone="amber" />
            <SummaryCard label="Errors" value={preview.errors.length} tone="red" />
          </div>

          {preview.valid.length > 0 && (
            <div className="rounded-xl border border-hairline bg-surface p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Preview (first 10 of {preview.valid.length})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-3">Row</th>
                      <th className="py-1 pr-3">Name</th>
                      <th className="py-1 pr-3">SKU</th>
                      <th className="py-1 pr-3">Qty</th>
                      <th className="py-1 pr-3">Reorder Level</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink-soft">
                    {preview.valid.slice(0, 10).map((r) => (
                      <tr key={r.row} className="border-t border-hairline">
                        <td className="py-1 pr-3">{r.row}</td>
                        <td className="py-1 pr-3">{r.name}</td>
                        <td className="py-1 pr-3">{r.sku ?? "—"}</td>
                        <td className="py-1 pr-3">{r.quantity_on_hand}</td>
                        <td className="py-1 pr-3">{r.reorder_level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <IssueList title="Skipped rows" issues={preview.skipped} tone="amber" />
          <IssueList title="Rows with errors — fix these in your file and re-upload if you want them included" issues={preview.errors} tone="red" />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCommit}
              disabled={busy || preview.valid.length === 0}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${preview.valid.length} Part${preview.valid.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-lg border border-hairline px-5 py-2 text-sm text-ink-soft hover:bg-surface-2 disabled:opacity-50"
            >
              Choose a Different File
            </button>
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-4">
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Imported {result.imported} part{result.imported === 1 ? "" : "s"}.
          </p>
          <IssueList title="Rows that failed during import" issues={result.errors} tone="red" />
          <div className="flex items-center gap-3">
            <Link
              href="/parts"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              View Inventory
            </Link>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-hairline px-5 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "red" }) {
  const toneClass =
    tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-red-400";
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 text-center">
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: { row: number; message: string }[];
  tone: "amber" | "red";
}) {
  if (issues.length === 0) return null;
  const toneClass = tone === "amber" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-red-500/30 bg-red-500/10 text-red-400";
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide">{title}</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
        {issues.map((issue, i) => (
          <li key={i}>
            {issue.row > 0 ? `Row ${issue.row}: ` : ""}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
