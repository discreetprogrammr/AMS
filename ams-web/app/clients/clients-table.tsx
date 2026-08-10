import Link from "next/link";
import { ClientRowActions } from "./client-row-actions";

export type ClientRow = {
  id: string;
  name: string;
  sector: string | null;
  primary_contact: string | null;
  email: string | null;
  siteCount: number;
  assetCount: number;
};

// Search used to be a client-side instant filter typed straight into this
// component. Now the page itself takes a ?q= and filters server-side (see
// app/clients/page.tsx), matching how /assets works — this table just
// renders whatever list it's given.
export function ClientsTable({
  clients,
  query,
}: {
  clients: ClientRow[];
  query?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Sector</th>
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Sites</th>
            <th className="px-4 py-3">Assets</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
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
              <td className="px-4 py-3 text-right">
                <ClientRowActions
                  organizationId={c.id}
                  organizationName={c.name}
                />
              </td>
            </tr>
          ))}
          {clients.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-8 text-center text-slate-500"
              >
                {query
                  ? `No clients match "${query}".`
                  : 'No clients yet. Click "Add Client" to create the first one.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
