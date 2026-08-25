"use client";

import Link from "next/link";
import { useState } from "react";
import { createSiteSurveyReport } from "../actions";
import { SignaturePad } from "@/components/signature-pad";
import { SiteVisitVerification } from "@/components/site-visit-verification";

type Status = "ok" | "attention" | "fail";
type Item = { section: string; item_label: string; status: Status; remarks: string };

// Condensed from Astrophysics' real Site Survey Information-Questions form
// (5 contact roles + Receiving Area + Receiving-to-Commissioning path +
// Commissioning Site power/space + Site Environment, across 3 pages) down
// to a 5-section, 15-item tap-cycle checklist — same UX/shape as the PM
// checklist (preventive-form.tsx), reusing the same generic
// service_record_checklist_items table (schema_step42.sql) rather than a
// new one.
const TEMPLATE: { section: string; items: string[] }[] = [
  { section: "Receiving Area", items: ["Loading Dock Access", "Door Clearance", "Floor Condition"] },
  { section: "Access Path", items: ["Elevator / Ramp Availability", "Doorway Width", "Path Obstructions"] },
  { section: "Power & Space", items: ["Power Outlet Availability", "Voltage / Grounding", "Room Clearance"] },
  { section: "Environment", items: ["Temperature Range (5–40°C)", "Humidity (<95%)", "Dust / Fumes Exposure"] },
  { section: "Connectivity", items: ["Network Access", "Printer Availability", "Security / Access Control"] },
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

export function SiteSurveyForm({
  sites,
  assets,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sites: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [siteId, setSiteId] = useState("");
  const [items, setItems] = useState<Item[]>(initialItems);

  function cycle(index: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, status: CYCLE[it.status] } : it)),
    );
  }

  function setRemarks(index: number, remarks: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, remarks } : it)));
  }

  // Existing equipment at the selected site, if any — a site survey can
  // reference one (e.g. assessing an upgrade) even though it doesn't
  // require one to exist at all (schema_step41.sql's asset_id/site_id
  // relaxation is exactly for this case).
  const assetsAtSite = siteId ? assets.filter((a) => a.site_id === siteId) : [];

  return (
    <form action={createSiteSurveyReport} className="space-y-6">
      {/* Same tap-to-cycle checklist pattern as the PM form — serialized
          here and read server-side from FormData on submit. */}
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-hairline bg-surface p-6 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Site</label>
          <select
            name="site_id"
            required
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Select site…
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {[site.organizations?.name, site.address].filter(Boolean).join(" — ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Related Asset (optional)</label>
          <select name="asset_id" defaultValue="" className={inputClass} disabled={!siteId}>
            <option value="">— None —</option>
            {assetsAtSite.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_tag}
                {asset.serial_number ? ` · SN ${asset.serial_number}` : ""}
              </option>
            ))}
          </select>
          {siteId && assetsAtSite.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">No existing equipment on file at this site yet.</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Survey Date</label>
          <input
            type="date"
            name="date_performed"
            required
            defaultValue={today}
            className={inputClass}
          />
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
                    <div className="w-56 shrink-0 text-sm text-ink-soft">
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
            <label className={labelClass}>Service Begin</label>
            <input type="time" name="service_begin" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Service Completed</label>
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
        <div>
          <label className={labelClass}>Target Install Date (optional)</label>
          <input type="date" name="next_due_date" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Site Suitability</label>
          <select name="result" defaultValue="pass" className={inputClass}>
            <option value="pass">Site Suitable for Installation</option>
            <option value="fail">Not Suitable / Remediation Required</option>
          </select>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Additional Notes &amp; Sign-off</h3>
        <textarea
          name="notes"
          rows={4}
          placeholder="Room dimensions, shielding needs, site contacts, structural notes, recommendations…"
          className={inputClass}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Surveyed By</label>
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
          <SignaturePad name="technician_signature" label="Surveyor Signature" />
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
