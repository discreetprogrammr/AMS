"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type ClientRow = {
  id: string;
  name: string;
  sector: string | null;
  primary_contact: string | null;
  email: string | null;
  siteCount: number;
  assetCount: number;
};

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.sector, c.primary_contact, c.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [clients, query]);

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients by name, sector, contact, or email…"
          className="w-full max-w-sm rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none sm:w-80"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Sector</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Sites</th>
              <th className="px-4 py-3">Assets</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                className="border-t border-hairline hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/clients/${c.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {c.name}
                  </Link>
                  {c.email && (
                    <div className="text-xs text-slate-500">{c.email}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-soft">{c.sector ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {c.primary_contact ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink-soft">{c.siteCount}</td>
                <td className="px-4 py-3 text-ink-soft">{c.assetCount}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  {clients.length === 0
                    ? 'No clients yet. Click "Add Client" to create the first one.'
                    : "No clients match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
