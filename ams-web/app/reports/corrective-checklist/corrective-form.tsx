"use client";

import Link from "next/link";
import { createCorrectiveReport } from "../actions";
import { CustomerSurvey } from "@/components/customer-survey";
import { SignaturePad } from "@/components/signature-pad";
import { SiteVisitVerification } from "@/components/site-visit-verification";
import { ticketRef } from "@/lib/format";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

// Split into one card per section (asset/date, fault diagnosis, outcome,
// survey, sign-off) rather than one large card — matches the layout the
// Preventive checklist form uses, and keeps <CustomerSurvey /> and
// <SignaturePad /> (each already a bordered card) visually consistent with
// the rest of the form instead of nesting a card inside a card.
export function CorrectiveChecklistForm({
  assets,
  prefilledAssetId,
  prefilledTicketId,
  linkableTickets,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any[];
  prefilledAssetId?: string | null;
  prefilledTicketId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  linkableTickets?: any[];
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={createCorrectiveReport} className="space-y-6">
      {prefilledTicketId ? (
        <input type="hidden" name="ticket_id" value={prefilledTicketId} />
      ) : (
        linkableTickets &&
        linkableTickets.length > 0 && (
          <div className="rounded-xl border border-hairline bg-surface p-6">
            <label className={labelClass}>Related Service Ticket (optional)</label>
            <select name="ticket_id" defaultValue="" className={inputClass}>
              <option value="">— None —</option>
              {linkableTickets.map((t) => (
                <option key={t.id} value={t.id}>
                  {[ticketRef(t.id), t.assets?.sites?.address]
                    .filter(Boolean)
                    .join(" — ")}
                  {t.assets?.serial_number ? ` · SN ${t.assets.serial_number}` : ""}{" "}
                  — {(t.description ?? "").slice(0, 60)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Ties this report to that ticket so it shows up in the ticket's detail view once generated.
            </p>
          </div>
        )
      )}

      <div className="space-y-5 rounded-xl border border-hairline bg-surface p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Asset</label>
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
            <label className={labelClass}>Date Performed</label>
            <input
              type="date"
              name="date_performed"
              required
              defaultValue={today}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Fault Description</label>
          <textarea
            name="fault_description"
            required
            rows={3}
            placeholder="What was reported / observed…"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Root Cause</label>
          <textarea name="root_cause" rows={2} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Corrective Action Taken</label>
          <textarea name="corrective_action" rows={2} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Parts Replaced</label>
          <input
            name="parts_replaced"
            placeholder="Comma-separated, e.g. Belt motor, Fuse 5A"
            className={inputClass}
          />
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

      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Downtime (hours)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              name="downtime_hours"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Outcome</label>
            <select name="result" defaultValue="pass" className={inputClass}>
              <option value="pass">Resolved</option>
              <option value="fail">Needs Follow-up</option>
            </select>
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
