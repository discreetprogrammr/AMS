import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/supabase/profile";
import { CONDITIONS, labelFor } from "@/lib/internal-equipment";
import { PrintButton } from "@/components/print-button";
import { loadCustodianItems } from "../load";

// Equipment clearance form for one person: every company item they hold,
// with a tick-box and remarks per item for the return, and signature lines.
// Standalone and always white, like the other printable documents. It only
// lists; nothing is changed by printing it.
export default async function ClearancePage({ searchParams }: { searchParams: { name?: string } }) {
  await requireStaff();
  const name = (searchParams?.name ?? "").trim();
  if (!name) redirect("/custodians");

  const { rows, spelling } = await loadCustodianItems(name);
  const person = rows.length ? spelling : name;
  const today = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
        <Link
          href={`/custodians/view?name=${encodeURIComponent(name)}`}
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
        >
          ← Back
        </Link>
        {rows.length > 0 && <PrintButton label="Print form" />}
      </div>

      <div className="mx-auto max-w-3xl px-8 py-10 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 flex items-center justify-between gap-6 border-b-2 border-slate-900 pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pacific-horizon-tek-logo.png" alt="Pacific Horizon Tek Inc." className="h-14 w-auto" />
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Equipment Register</p>
            <h1 className="text-xl font-bold">Equipment Clearance Form</h1>
            <p className="text-xs text-slate-500">{today}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div className="border-b border-slate-200 pb-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Employee / custodian</p>
            <p className="font-medium">{person}</p>
          </div>
          <div className="border-b border-slate-200 pb-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Items on record</p>
            <p className="font-medium">{rows.length}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-slate-500">No active equipment is recorded for this person.</p>
        ) : (
          <table className="mt-6 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-400 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3 font-medium">Asset No.</th>
                <th className="py-1 pr-3 font-medium">Item</th>
                <th className="py-1 pr-3 font-medium">Serial</th>
                <th className="py-1 pr-3 font-medium">Condition on record</th>
                <th className="py-1 pr-3 font-medium">Returned</th>
                <th className="py-1 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="break-inside-avoid border-b border-slate-200 align-top">
                  <td className="py-2 pr-3 font-mono font-semibold">{r.asset_tag}</td>
                  <td className="py-2 pr-3">{r.description || [r.brand, r.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="py-2 pr-3">{r.serial_number ?? "—"}</td>
                  <td className="py-2 pr-3">{labelFor(CONDITIONS, r.condition)}</td>
                  <td className="py-2 pr-3 text-base">☐</td>
                  <td className="w-40 py-2">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-8 text-xs leading-relaxed text-slate-600">
          The employee named above confirms that the equipment ticked as returned has been handed back in the condition
          noted, and acknowledges responsibility for any item not returned.
        </p>

        <div className="mt-10 grid grid-cols-3 gap-x-8 text-sm">
          {["Employee (name, signature, date)", "Received by (name, signature, date)", "Noted by (HR / Admin)"].map((label) => (
            <div key={label}>
              <div className="border-b border-slate-900 pt-10" />
              <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
