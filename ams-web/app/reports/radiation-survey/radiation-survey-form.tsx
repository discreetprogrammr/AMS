"use client";

import Link from "next/link";
import { useState } from "react";
import { createRadiationSurveyReport } from "../actions";
import { CustomerSurvey } from "@/components/customer-survey";
import { SignaturePad } from "@/components/signature-pad";
import { SiteVisitVerification } from "@/components/site-visit-verification";

type Reading = { location: string; reading: string; unit: string; limit: string };

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

// Common leakage-radiation measurement points for a typical X-ray
// screening unit — a reasonable starting point the surveyor can edit,
// add to, or remove entirely rather than typing every row from scratch.
const DEFAULT_READINGS: Reading[] = [
  { location: "Operator position", reading: "", unit: "mR/hr", limit: "0.5 mR/hr" },
  { location: "1m from tube head", reading: "", unit: "mR/hr", limit: "0.5 mR/hr" },
  { location: "Control panel", reading: "", unit: "mR/hr", limit: "0.5 mR/hr" },
  { location: "Cabinet surface", reading: "", unit: "mR/hr", limit: "0.5 mR/hr" },
];

function addOneYear(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function RadiationSurveyForm({
  assets,
  prefilledAssetId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any[];
  prefilledAssetId?: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [readings, setReadings] = useState<Reading[]>(DEFAULT_READINGS);
  const [surveyDate, setSurveyDate] = useState(today);
  const [nextDueTouched, setNextDueTouched] = useState(false);
  const [nextDue, setNextDue] = useState(addOneYear(today));

  function updateReading(idx: number, patch: Partial<Reading>) {
    setReadings((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setReadings((prev) => [...prev, { location: "", reading: "", unit: "mR/hr", limit: "" }]);
  }

  function removeRow(idx: number) {
    setReadings((prev) => prev.filter((_, i) => i !== idx));
  }

  function onDateChange(value: string) {
    setSurveyDate(value);
    if (!nextDueTouched) setNextDue(addOneYear(value));
  }

  return (
    <form action={createRadiationSurveyReport} className="space-y-6">
      <input type="hidden" name="radiation_readings" value={JSON.stringify(readings)} />

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-hairline bg-surface p-6 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Asset Surveyed</label>
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
          <label className={labelClass}>Survey Date</label>
          <input
            type="date"
            name="date_performed"
            required
            value={surveyDate}
            onChange={(e) => onDateChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Next Survey Due</label>
          <input
            type="date"
            name="next_due_date"
            value={nextDue}
            onChange={(e) => {
              setNextDueTouched(true);
              setNextDue(e.target.value);
            }}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">Defaults to one year out — PNRI surveys are annual.</p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Survey Meter Used</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className={labelClass}>Meter Model</label>
            <input name="survey_meter_model" placeholder="e.g. Fluke 451P" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Meter Serial No.</label>
            <input name="survey_meter_serial" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Meter Cal. Date</label>
            <input type="date" name="survey_meter_calibration_date" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Report Reference #</label>
            <input name="report_reference_no" placeholder="Internal / PNRI reference" className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Whichever meter was used — ours or the client&apos;s — as long as it&apos;s currently within its own
          annual PNRI calibration.
        </p>
      </div>

      <div className="rounded-xl border border-hairline bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Radiation Survey Readings</h3>
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-2"
          >
            + Add Measurement Point
          </button>
        </div>
        <div className="space-y-3">
          {readings.map((r, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <input
                value={r.location}
                onChange={(e) => updateReading(idx, { location: e.target.value })}
                placeholder="Measurement point"
                className={inputClass}
              />
              <input
                value={r.reading}
                onChange={(e) => updateReading(idx, { reading: e.target.value })}
                placeholder="Reading"
                className={inputClass}
              />
              <input
                value={r.unit}
                onChange={(e) => updateReading(idx, { unit: e.target.value })}
                placeholder="Unit"
                className={inputClass}
              />
              <input
                value={r.limit}
                onChange={(e) => updateReading(idx, { limit: e.target.value })}
                placeholder="PNRI limit"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="mt-1 rounded-lg border border-hairline px-3 py-2 text-xs text-red-400 hover:bg-surface-2 sm:mt-0"
              >
                Remove
              </button>
            </div>
          ))}
          {readings.length === 0 && (
            <p className="text-sm text-slate-500">No measurement points added yet.</p>
          )}
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
        <h3 className="text-sm font-semibold text-ink">Survey Result</h3>
        <select name="result" defaultValue="pass" className={inputClass}>
          <option value="pass">Within Regulatory Limits</option>
          <option value="fail">Exceeds Limits — Action Required</option>
        </select>
      </div>

      <CustomerSurvey />

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink">Comments &amp; Sign-off</h3>
        <textarea
          name="notes"
          rows={3}
          placeholder="Observations, recommendations…"
          className={inputClass}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Radiation Surveyor Name</label>
            <input
              name="performed_by"
              required
              placeholder="Required — who performed this survey"
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
