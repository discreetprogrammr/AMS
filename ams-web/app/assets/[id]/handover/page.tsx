import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import { ASSIGNMENT_STATUSES, CONDITIONS, SEGMENTS, labelFor } from "@/lib/internal-equipment";
import { PrintButton } from "@/components/print-button";

// Printable equipment handover / accountability form for one internal item:
// what it is, who holds it now, and signature lines for issuing, returning
// or transferring it. Standalone and always white, like the printable
// service report, since a dark theme does not print. Internal equipment
// only: a client asset is "not found" here, whoever asks.
export default async function HandoverFormPage({ params }: { params: { id: string } }) {
  await requireStaff();
  const supabase = await createClient();
  const internalOrgIds = await getInternalOrgIds(supabase);

  const { data: asset } = await supabase
    .from("assets")
    .select(
      "id, organization_id, asset_tag, asset_category, description, brand, model, serial_number, quantity, segment, custodian, department, date_issued, assignment_status, condition, remarks, sites(address)",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!asset || !internalOrgIds.includes(asset.organization_id)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const site = (asset as any).sites?.address as string | undefined;
  const today = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const details: [string, string][] = [
    ["Asset No.", asset.asset_tag],
    ["Category", asset.asset_category || "—"],
    ["Equipment / Description", asset.description || "—"],
    ["Brand / Model", [asset.brand, asset.model].filter(Boolean).join(" ") || "—"],
    ["Serial No.", asset.serial_number || "—"],
    ["Qty", String(asset.quantity ?? 1)],
    ["Segment", labelFor(SEGMENTS, asset.segment)],
    ["Location", site || "—"],
    ["Condition", labelFor(CONDITIONS, asset.condition)],
    ["Status", labelFor(ASSIGNMENT_STATUSES, asset.assignment_status)],
    ["Current custodian", asset.custodian || "—"],
    ["Department", asset.department || "—"],
    ["Date issued", asset.date_issued || "—"],
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
        <Link
          href={`/assets/${asset.id}`}
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
        >
          ← Back to {asset.asset_tag}
        </Link>
        <PrintButton label="Print form" />
      </div>

      <div className="mx-auto max-w-3xl px-8 py-10 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 flex items-center justify-between gap-6 border-b-2 border-slate-900 pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pacific-horizon-tek-logo.png" alt="Pacific Horizon Tek Inc." className="h-14 w-auto" />
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Equipment Register</p>
            <h1 className="text-xl font-bold">Equipment Handover Form</h1>
            <p className="text-xs text-slate-500">{today}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="border-b border-slate-200 pb-1">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 text-sm">
          <p className="font-semibold">This form records (tick one)</p>
          <p className="mt-2 flex flex-wrap gap-x-8 gap-y-1">
            <span>☐ Issued to a custodian</span>
            <span>☐ Returned to the company</span>
            <span>☐ Transferred to another custodian</span>
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 text-sm">
          <Line label="New custodian (name)" />
          <Line label="Department" />
          <Line label="Date" />
          <Line label="Condition on handover" />
        </div>

        <div className="mt-6 text-sm">
          <p className="font-semibold">Accessories and remarks</p>
          <div className="mt-2 space-y-5">
            <div className="border-b border-slate-400 pt-4" />
            <div className="border-b border-slate-400 pt-4" />
            {asset.remarks ? <p className="text-xs text-slate-500">On file: {asset.remarks}</p> : null}
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-slate-600">
          The custodian named above acknowledges receiving the equipment in the condition stated, agrees to use it
          for company business, to keep it safe, to report loss or damage promptly, and to return it when asked or
          when leaving the company.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-10 text-sm">
          <Signature label="Issued by (name, signature, date)" />
          <Signature label="Received by (name, signature, date)" />
        </div>
      </div>
    </div>
  );
}

function Line({ label }: { label: string }) {
  return (
    <div>
      <div className="border-b border-slate-400 pt-5" />
      <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div>
      <div className="border-b border-slate-900 pt-10" />
      <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
