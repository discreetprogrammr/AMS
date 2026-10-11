"use client";

import { useState } from "react";
import Link from "next/link";
import {
  commitInternalImport,
  parseInternalImport,
  type InternalImportPreview,
  type InternalImportResult,
} from "./actions";
import { SEGMENTS, labelFor } from "@/lib/internal-equipment";

type Phase = "pick" | "preview" | "done";

// Two steps like the client importer: preview what would happen, then
// import. The import step uploads the same file again; the server re-reads
// and re-checks it, and nothing the browser sends back is trusted.
export function InternalImportForm() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InternalImportPreview | null>(null);
  const [result, setResult] = useState<InternalImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function body() {
    const formData = new FormData();
    if (file) formData.set("file", file);
    return formData;
  }

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a CSV file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPreview(await parseInternalImport(body()));
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setBusy(true);
    setError(null);
    try {
      setResult(await commitInternalImport(body()));
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
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
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
              Up to 500 rows per file. The columns are the ones on the internal export, so you can also export,
              edit and upload. Not sure of the format?{" "}
              <a href="/api/assets/import/internal-template" className="text-blue-400 hover:underline">
                Download the template
              </a>
              .
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Segment is required: Pacific Horizon Tek or Team Fridays Digital.</li>
            <li>Asset No. can be left blank; the next PHT-EQ number is given on import.</li>
            <li>Dates are YYYY-MM-DD. Status, Condition and Ownership accept the names shown in the app.</li>
            <li>Everything goes into the internal organization. Rows are added; existing items are not changed.</li>
          </ul>
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
                      <th className="py-1 pr-3">Asset No.</th>
                      <th className="py-1 pr-3">Item</th>
                      <th className="py-1 pr-3">Segment</th>
                      <th className="py-1 pr-3">Custodian</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink-soft">
                    {preview.valid.slice(0, 10).map((r) => (
                      <tr key={r.row} className="border-t border-hairline">
                        <td className="py-1 pr-3">{r.row}</td>
                        <td className="py-1 pr-3">{r.asset_tag ?? "next number"}</td>
                        <td className="py-1 pr-3">
                          {r.description || [r.brand, r.model].filter(Boolean).join(" ")}
                        </td>
                        <td className="py-1 pr-3">{labelFor(SEGMENTS, r.segment)}</td>
                        <td className="py-1 pr-3">{r.custodian ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <IssueList title="Skipped rows" issues={preview.skipped} tone="amber" />
          <IssueList
            title="Rows with errors. Fix these in your file and upload again if you want them included"
            issues={preview.errors}
            tone="red"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCommit}
              disabled={busy || preview.valid.length === 0}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${preview.valid.length} Item${preview.valid.length === 1 ? "" : "s"}`}
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
            Imported {result.imported} item{result.imported === 1 ? "" : "s"}.
          </p>
          <IssueList title="Rows that failed during import" issues={result.errors} tone="red" />
          <div className="flex items-center gap-3">
            <Link
              href="/assets"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              View Assets
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
  const toneClass = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-red-400";
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
  const toneClass =
    tone === "amber" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-red-500/30 bg-red-500/10 text-red-400";
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
