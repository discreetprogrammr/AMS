"use client";

import Link from "next/link";
import { useState } from "react";
import { createPreventiveReport } from "../actions";
import { CustomerSurvey } from "@/components/customer-survey";
import { SignaturePad } from "@/components/signature-pad";
import { SiteVisitVerification } from "@/components/site-visit-verification";

type Status = "ok" | "attention" | "fail";
type Item = { section: string; item_label: string; status: Status; remarks: string };

// Same 5-section, 15-item structure as the reference's PM checklist —
// generic enough for the X-ray screening equipment (Linev/Apstec) that
// makes up most of the deployed fleet; can be tailored per equipment_type
// later.
const TEMPLATE: { section: string; items: string[] }[] = [
  { section: "External Parts", items: ["Panels", "Monitors", "Displays", "Control Modules"] },
  { section: "Moving Components", items: ["Conveyor Belt / Roller", "Motor"] },
  { section: "Internal Parts", items: ["PC", "Generator", "Other Internal Parts"] },
  { section: "Safety Parts", items: ["Interlock", "Emergency Stop", "Lead Protector & Curtain"] },
  { section: "Software", items: ["OS", "GUI", "Graph"] },
];

function initialItems(): Item[] {
  const out: Item[] = [];
  for (const group of TEMPLATE) {
    for (const label of group.items) {
      out.push({ section: group.section, item_label: label, status: "ok", remarks: "" });
    }
  }
  return out;
}

const CYCLE: Record<Status, Status> = { ok: "attention", attention: "fail", fail: "ok" };
const STYLES: Record<Status, string> = {
  ok: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  attention: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  fail: "bg-red-500/15 text-red-400 ring-red-500/30",
};
const LABELS: Record<Status, string> = { ok: "OK", attention: "ATTENTION", fail: "FAIL" };

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export function PreventiveChecklistForm({
  assets,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);

  function cycle(index: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, status: CYCLE[it.status] } : it)),
    );
  }

  function setRemarks(index: number, remarks: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, remarks } : it)));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={createPreventiveReport} className="space-y-6">
      {/* The checklist grid is interactive (tap-to-cycle), so it lives in
          React state; it's serialized here and read server-side from
          FormData, same as any other field on submit. */}
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-hairline bg-surface p-6 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Asset</label>
          <select name="asset_id" required className={inputClass}>
            <option value="" disabled>
              Select asset…
            </option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {[asset.organizations?.name, asset.sites?.address]
                  .filter(Boolean)
                  .join(" — ")}
                {asset.serial_number ? ` · SN ${asset.serial_number}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Date Performed</label>
          <input
            type="date"
            name="date_performed"
            required
            defaultValue={today}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Next Due Date</label>
          <input type="date" name="next_due_date" className={inputClass} />
        </div>
      </div>

      <SiteVisitVerification />

      <div className="space-y-4">
        {TEMPLATE.map((group) => (
          <div
            key={group.section}
            className="overflow-hidden rounded-xl border border-hairline bg-surface"
          >
            <div className="border-b border-hairline px-6 py-3 text-sm font-semibold text-ink">
              {group.section}
            </div>
            <div className="divide-y divide-hairline">
              {items
                .map((it, idx) => ({ it, idx }))
                .filter(({ it }) => it.section === group.section)
                .map(({ it, idx }) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-3 px-6 py-3"
                  >
                    <div className="w-48 shrink-0 text-sm text-ink-soft">
                      {it.item_label}
                    </div>
                    <button
                      type="button"
                      onClick={() => cycle(idx)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ring-1 ring-inset ${STYLES[it.status]}`}
                    >
                      {LABELS[it.status]}
                    </button>
                    <input
                      type="text"
                      value={it.remarks}
                      onChange={(e) => setRemarks(idx, e.target.value)}
                      placeholder="Remarks (optional)"
                      className="min-w-[160px] flex-1 rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Service Timing</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className={labelClass}>Time Arrived</label>
            <input type="time" name="time_arrived" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Begin PM</label>
            <input type="time" name="service_begin" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>PM Completed</label>
            <input type="time" name="service_completed" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select name="visit_status" defaultValue="Completed" className={inputClass}>
              <option>Completed</option>
              <option>Pending</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">If Failures Occurred</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className={labelClass}>Start Diagnostic</label>
            <input type="time" name="diagnostic_start" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Diagnostic Done</label>
            <input type="time" name="diagnostic_done" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Repair Starts</label>
            <input type="time" name="repair_start" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Repair Ends</label>
            <input type="time" name="repair_end" className={inputClass} />
          </div>
        </div>
      </div>

      <CustomerSurvey />

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Comments &amp; Sign-off</h3>
        <textarea
          name="notes"
          rows={3}
          placeholder="Additional comments…"
          className={inputClass}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Performed By</label>
            <input
              name="performed_by"
              placeholder="Service engineer / technician"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Customer Signatory</label>
            <input
              name="customer_signatory"
              placeholder="Representative (printed name)"
              className={inputClass}
            />
          </div>
          <SignaturePad name="technician_signature" label="Technician Signature" />
          <SignaturePad name="customer_signature" label="Customer Signature" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          Submit Report
        </button>
        <Link
          href="/reports"
          className="rounded-lg border border-hairline px-5 py-2 text-sm text-ink-soft hover:bg-surface-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
