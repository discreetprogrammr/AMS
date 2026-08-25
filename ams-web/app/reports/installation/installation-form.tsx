"use client";

import Link from "next/link";
import { createInstallationReport } from "../actions";
import { CustomerSurvey } from "@/components/customer-survey";
import { SignaturePad } from "@/components/signature-pad";
import { SiteVisitVerification } from "@/components/site-visit-verification";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export function InstallationForm({
  assets,
  prefilledAssetId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any[];
  prefilledAssetId?: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={createInstallationReport} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-hairline bg-surface p-6 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Asset (newly installed unit)</label>
          <select
            name="asset_id"
            required
            defaultValue={prefilledAssetId ?? ""}
            className={inputClass}
          >
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
          <label className={labelClass}>Installation Date</label>
          <input
            type="date"
            name="date_performed"
            required
            defaultValue={today}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>First PM Due</label>
          <input type="date" name="next_due_date" className={inputClass} />
        </div>
      </div>

      <SiteVisitVerification />

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
        <h3 className="text-sm font-semibold text-ink">Commissioning Outcome</h3>
        <select name="result" defaultValue="pass" className={inputClass}>
          <option value="pass">Installed &amp; Commissioned</option>
          <option value="fail">Issues Found — Follow-up Required</option>
        </select>
      </div>

      <CustomerSurvey />

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Comments &amp; Sign-off</h3>
        <textarea
          name="notes"
          rows={3}
          placeholder="Scope of work, accessories included, commissioning notes…"
          className={inputClass}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Installed By</label>
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
