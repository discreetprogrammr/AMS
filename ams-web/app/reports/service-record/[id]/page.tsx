import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reportRef } from "@/lib/format";
import {
  reportKindOf,
  REPORT_KIND_REF_PREFIX,
  REPORT_KIND_TITLES,
  type ReportKind,
} from "@/lib/report-types";
import { PrintButton } from "@/components/print-button";

const NEXT_FIELD_LABEL: Record<ReportKind, string> = {
  pm: "Next Due",
  cm: "Downtime", // special-cased below — uses downtime_hours, not next_due_date
  installation: "First PM Due",
  radiation_survey: "Next Survey Due",
  site_survey: "Target Install Date",
  training: "Next Refresher Due",
};

const FINDINGS_TITLE: Record<ReportKind, string> = {
  pm: "Findings & Comments",
  cm: "Fault, Action Taken & Comments",
  installation: "Installation Notes & Comments",
  radiation_survey: "Observations & Recommendations",
  site_survey: "Site Assessment Findings & Recommendations",
  training: "Topics Covered & Notes",
};

// Printable / "download as PDF" view of a single service report (PM or
// CM). No PDF-generation library (pdf-lib, jsPDF, etc.) is installable in
// this environment — this sandbox's package registry only allows the
// dependencies already in package.json, even though the same install
// would succeed fine on Vercel at deploy time. Rather than ship an
// untestable dependency, this renders the report as a real, clean, white
// print stylesheet and lets the browser's native "Print > Save as PDF"
// produce the actual file — same underlying mechanism most invoicing/
// reporting SaaS tools use, and it can never drift out of sync with the
// stored data since there's no separate generation step to go stale.
//
// No AppShell here on purpose: this is a standalone printable document,
// not an app page, and deliberately ignores the dark/light theme toggle
// (always white background) since a dark UI theme doesn't print/PDF well.
export default async function ServiceReportPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  const { data: record } = await supabase
    .from("service_records")
    .select(
      `id, service_type, date_performed, performed_by, findings, result,
       next_due_date, downtime_hours, created_at, site_id,
       radiation_readings, survey_meter_model, survey_meter_serial,
       survey_meter_calibration_date, report_reference_no, training_attendees,
       csat_service, csat_machine, csat_support, csat_overall,
       customer_signatory, technician_signature, customer_signature,
       time_arrived, service_begin, service_completed, visit_status,
       diagnostic_start, diagnostic_done, repair_start, repair_end,
       assets(asset_tag, equipment_type, brand, model, serial_number,
         sites(address), organizations(name))`,
    )
    .eq("id", params.id)
    .single();

  if (!record) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asset = (record as any).assets;
  const kind = reportKindOf(record.service_type);
  const isPM = kind === "pm";
  const isCM = kind === "cm";

  // Asset-less (site-only) records — Site Survey/Training filed with no
  // specific unit selected (schema_step41.sql) — need their own site/org
  // lookup, since the `assets(...)` join above returns nothing for them.
  const siteRecordId = (record as { site_id: string | null }).site_id;
  const { data: siteOnly } =
    !asset && siteRecordId
      ? await supabase
          .from("sites")
          .select("address, organizations(name)")
          .eq("id", siteRecordId)
          .single()
      : { data: null };

  const [{ data: items }, { data: parts }] = await Promise.all([
    isPM
      ? supabase
          .from("service_record_checklist_items")
          .select("section, item_label, status, remarks")
          .eq("service_record_id", params.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    isCM
      ? supabase
          .from("service_record_parts")
          .select("part_name, quantity, status")
          .eq("service_record_id", params.id)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const ref = reportRef(record.id, REPORT_KIND_REF_PREFIX[kind]);
  const reportTitle = REPORT_KIND_TITLES[kind];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const siteOnlyAny = siteOnly as any;
  const organizationName = asset?.organizations?.name ?? siteOnlyAny?.organizations?.name;
  const siteAddress = asset?.sites?.address ?? siteOnlyAny?.address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const radiationReadings = ((record as any).radiation_readings ?? []) as {
    location: string;
    reading: string;
    unit: string;
    limit: string;
  }[];

  const csatRows: { label: string; value: number | null }[] = [
    { label: "Service", value: record.csat_service },
    { label: "Machine / Unit", value: record.csat_machine },
    { label: "Support", value: record.csat_support },
    { label: "Overall", value: record.csat_overall },
  ];
  const hasCsat = csatRows.some((r) => r.value != null);

  const hasFailureTiming =
    record.diagnostic_start ||
    record.diagnostic_done ||
    record.repair_start ||
    record.repair_end;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
        <Link
          href="/reports"
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
        >
          ← Back to Reports
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-3xl px-8 py-10 print:max-w-none print:px-0 print:py-0">
        {/* Letterhead */}
        <div className="mb-8 flex items-center justify-between gap-6 border-b-2 border-slate-900 pb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pacific-horizon-tek-logo.png"
            alt="Pacific Horizon Tek Inc."
            className="h-14 w-auto"
          />
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              {reportTitle}
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-900">
              {ref}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {record.date_performed
                ? new Date(record.date_performed).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </div>
          </div>
        </div>

        {/* Report meta */}
        <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-slate-200 p-5 sm:grid-cols-3">
          <Meta label="Customer" value={organizationName} />
          <Meta label="Site" value={siteAddress} />
          <Meta label="Asset" value={asset?.asset_tag ?? (asset ? null : "— (site-level report)")} />
          <Meta
            label="Equipment"
            value={asset ? [asset?.brand, asset?.model].filter(Boolean).join(" ") || asset?.equipment_type : null}
          />
          <Meta label="Serial No." value={asset?.serial_number} />
          <Meta label="Performed By" value={record.performed_by} />
          {isCM ? (
            <Meta
              label="Downtime"
              value={record.downtime_hours != null ? `${record.downtime_hours}h` : null}
            />
          ) : (
            <Meta
              label={NEXT_FIELD_LABEL[kind]}
              value={
                record.next_due_date
                  ? new Date(record.next_due_date).toLocaleDateString()
                  : null
              }
            />
          )}
          <Meta
            label="Outcome"
            value={
              record.result === "fail"
                ? "Needs Follow-up / Failed"
                : record.result === "pass"
                  ? "Pass / Resolved"
                  : null
            }
          />
        </div>

        {/* Radiation survey readings */}
        {kind === "radiation_survey" && radiationReadings.length > 0 && (
          <Section title="Radiation Survey Readings">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Measurement Point</th>
                    <th className="py-2 pr-3">Reading</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2">PNRI Limit</th>
                  </tr>
                </thead>
                <tbody>
                  {radiationReadings.map((r, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3">{r.location || "—"}</td>
                      <td className="py-1.5 pr-3">{r.reading || "—"}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{r.unit || "—"}</td>
                      <td className="py-1.5 text-slate-600">{r.limit || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {kind === "radiation_survey" &&
          (record.survey_meter_model ||
            record.survey_meter_serial ||
            record.survey_meter_calibration_date ||
            record.report_reference_no) && (
            <Section title="Survey Meter Used">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Meta label="Meter Model" value={record.survey_meter_model} />
                <Meta label="Meter Serial No." value={record.survey_meter_serial} />
                <Meta
                  label="Meter Cal. Date"
                  value={
                    record.survey_meter_calibration_date
                      ? new Date(record.survey_meter_calibration_date).toLocaleDateString()
                      : null
                  }
                />
                <Meta label="Report Reference #" value={record.report_reference_no} />
              </div>
            </Section>
          )}

        {/* Training attendees */}
        {kind === "training" && record.training_attendees && (
          <Section title="Attendees">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {record.training_attendees}
            </p>
          </Section>
        )}

        {/* PM checklist */}
        {isPM && items && items.length > 0 && (
          <Section title="Checklist">
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Section</th>
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {items.map((it: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 text-slate-500">{it.section}</td>
                    <td className="py-1.5 pr-3">{it.item_label}</td>
                    <td className="py-1.5 pr-3">
                      <ChecklistBadge status={it.status} />
                    </td>
                    <td className="py-1.5 text-slate-600">{it.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Section>
        )}

        {/* CM parts */}
        {isCM && parts && parts.length > 0 && (
          <Section title="Parts Replaced">
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Part</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {parts.map((p: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{p.part_name}</td>
                    <td className="py-1.5 pr-3">{p.quantity}</td>
                    <td className="py-1.5 capitalize text-slate-600">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Section>
        )}

        {/* Findings / comments (already includes fault, root cause, action
            taken, and any free-text comments — see app/reports/actions.ts,
            which composes this single field at submit time). */}
        {record.findings && (
          <Section title={FINDINGS_TITLE[kind]}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {record.findings}
            </p>
          </Section>
        )}

        {/* Service timing */}
        {(record.time_arrived ||
          record.service_begin ||
          record.service_completed ||
          record.visit_status) && (
          <Section title="Service Timing">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Meta label="Time Arrived" value={record.time_arrived} />
              <Meta label={isPM ? "Begin PM" : "Service Begin"} value={record.service_begin} />
              <Meta label={isPM ? "PM Completed" : "Service Completed"} value={record.service_completed} />
              <Meta label="Status" value={record.visit_status} />
            </div>
          </Section>
        )}

        {hasFailureTiming && (
          <Section title="If Failures Occurred">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Meta label="Start Diagnostic" value={record.diagnostic_start} />
              <Meta label="Diagnostic Done" value={record.diagnostic_done} />
              <Meta label="Repair Starts" value={record.repair_start} />
              <Meta label="Repair Ends" value={record.repair_end} />
            </div>
          </Section>
        )}

        {/* CSAT */}
        {hasCsat && (
          <Section title="Customer Satisfaction Rating">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {csatRows.map((r) => (
                <div key={r.label}>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {r.label}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {r.value != null ? `${r.value} / 5` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Sign-off */}
        <Section title="Sign-off">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <SignatureBlock
              label="Technician Signature"
              name={record.performed_by}
              dataUrl={record.technician_signature}
            />
            <SignatureBlock
              label="Customer Signature"
              name={record.customer_signatory}
              dataUrl={record.customer_signature}
            />
          </div>
        </Section>

        <div className="mt-10 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
          Pacific Horizon Tek Inc. — Confidential service record. Generated{" "}
          {new Date().toLocaleString()}.
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-slate-900">{value || "—"}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8 break-inside-avoid">
      <h2 className="mb-3 border-b border-slate-200 pb-1.5 text-sm font-semibold text-slate-900">
        {title}
      </h2>
      {children}
    </div>
  );
}

function ChecklistBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ok: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    attention: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    fail: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  };
  const labels: Record<string, string> = {
    ok: "OK",
    attention: "ATTENTION",
    fail: "FAIL",
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
        styles[status] ?? styles.ok
      }`}
    >
      {labels[status] ?? status.toUpperCase()}
    </span>
  );
}

function SignatureBlock({
  label,
  name,
  dataUrl,
}: {
  label: string;
  name?: string | null;
  dataUrl?: string | null;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 flex h-20 items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={label} className="h-full object-contain" />
        ) : (
          <span className="text-xs text-slate-400">Not signed</span>
        )}
      </div>
      <div className="mt-1 text-xs text-slate-600">{name || ""}</div>
    </div>
  );
}
