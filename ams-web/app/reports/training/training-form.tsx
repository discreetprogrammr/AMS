"use client";

import Link from "next/link";
import { useState } from "react";
import { createTrainingReport } from "../actions";
import { CustomerSurvey } from "@/components/customer-survey";
import { SignaturePad } from "@/components/signature-pad";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export function TrainingForm({
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

  const assetsAtSite = siteId ? assets.filter((a) => a.site_id === siteId) : [];

  return (
    <form action={createTrainingReport} className="space-y-6">
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
            <option value="">— None (general training) —</option>
            {assetsAtSite.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_tag}
                {asset.serial_number ? ` · SN ${asset.serial_number}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Training Date</label>
          <input
            type="date"
            name="date_performed"
            required
            defaultValue={today}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <div>
          <label className={labelClass}>Attendees</label>
          <textarea
            name="training_attendees"
            rows={4}
            placeholder="One name per line"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Next Refresher Due (optional)</label>
          <input type="date" name="next_due_date" className={inputClass} />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Topics Covered &amp; Notes</h3>
        <textarea
          name="notes"
          rows={4}
          placeholder="What was covered, questions raised, follow-up items…"
          className={inputClass}
        />
      </div>

      <CustomerSurvey />

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Sign-off</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Trainer Name</label>
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
          <SignaturePad name="technician_signature" label="Trainer Signature" />
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
