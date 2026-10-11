// Weekly Warranty & Renewals reminder for the HR & Admin preset users. Same
// shape as the weekly ops digest (lib/report-digest.ts): a scheduled
// summary, not an event, so there is nothing to de-dupe; each firing is a
// distinct week. Recipients are the people who have the HR & Admin preset
// (read with the service-role client, because the cron job has no session);
// nothing is configured by hand. Email is a soft channel (lib/email.ts): an
// unconfigured or failing Resend returns a message, it never throws.
import { sendEmail } from "./email";
import { wrapEmail } from "./notify";
import { createServiceRoleClient } from "./supabase/service-role";
import { getInternalOrgIds } from "@/lib/internal-org";
import { HR_ADMIN_PRESET_MARKER } from "@/lib/hr-admin-preset";
import { excludeRetired, manilaDate } from "@/lib/internal-equipment";
import { bucketWarranties, daysLabel, WARRANTY_BUCKETS, type WarrantyBuckets, type WarrantyRow } from "@/lib/warranty";
import { loadAssemblyIds, withoutAssemblies } from "@/lib/assemblies";

const APP_NAME = "HorizonCare360";
const MAX_ROWS_PER_SECTION = 25;

export const WARRANTY_SELECT =
  "id, asset_tag, description, brand, model, custodian, department, warranty_end_date, assignment_status, condition";

export async function loadWarrantyBuckets(): Promise<{ buckets: WarrantyBuckets; today: string }> {
  const supabase = createServiceRoleClient();
  const orgIds = await getInternalOrgIds(supabase);
  const today = manilaDate();
  if (orgIds.length === 0) return { buckets: bucketWarranties([], today), today };

  let query = supabase.from("assets").select(WARRANTY_SELECT).in("organization_id", orgIds);
  query = excludeRetired(query);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load internal warranties: ${error.message}`);
  const assemblies = await loadAssemblyIds(supabase, orgIds);
  return { buckets: bucketWarranties(withoutAssemblies((data ?? []) as WarrantyRow[], assemblies), today), today };
}

/** Emails of everyone with the HR & Admin preset. */
export async function warrantyRecipients(): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .contains("hidden_modules", [HR_ADMIN_PRESET_MARKER]);
  if (error) throw new Error(`Failed to look up recipients: ${error.message}`);
  const ids = new Set((profiles ?? []).map((p: { id: string }) => p.id));
  if (ids.size === 0) return [];

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) throw new Error(`Failed to look up recipient emails: ${usersError.message}`);
  return (users?.users ?? []).filter((u) => ids.has(u.id) && u.email).map((u) => u.email as string);
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildWarrantyHtml(b: WarrantyBuckets): string {
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  const sections = WARRANTY_BUCKETS.map(({ key, label }) => {
    const rows = b[key];
    if (rows.length === 0) return "";
    const shown = rows.slice(0, MAX_ROWS_PER_SECTION);
    const more = rows.length - shown.length;
    return `
      <h3 style="margin:20px 0 6px;font-size:14px;">${label} (${rows.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${shown
          .map(
            (r) => `<tr>
              <td style="padding:4px 0;font-family:monospace;">${esc(r.asset_tag)}</td>
              <td style="padding:4px 8px;">${esc(r.description || [r.brand, r.model].filter(Boolean).join(" ") || "—")}</td>
              <td style="padding:4px 8px;color:#64748b;">${esc(r.custodian || "no custodian")}</td>
              <td style="padding:4px 0;text-align:right;color:#64748b;">${esc(r.warranty_end_date ?? "")} · ${daysLabel(r.daysLeft)}</td>
            </tr>`,
          )
          .join("")}
      </table>
      ${more > 0 ? `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">and ${more} more</p>` : ""}`;
  }).join("");

  const body = `
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Company equipment warranties that have lapsed or end within 90 days. Retired and lost items are left out.</p>
    ${sections || "<p>Nothing to report.</p>"}
    ${b.unknown > 0 ? `<p style="margin-top:16px;font-size:13px;">${b.unknown} item${b.unknown === 1 ? " has" : "s have"} no warranty date recorded.</p>` : ""}
    <p style="margin-top:16px;font-size:12px;color:#94a3b8;">${
      baseUrl ? `Full list: <a href="${baseUrl}/warranty">Warranty &amp; Renewals</a> in ${APP_NAME}.` : `Full list: Warranty &amp; Renewals in ${APP_NAME}.`
    }</p>`;
  return wrapEmail("Warranty & Renewals", body);
}

export type WarrantyReminderResult = {
  sent: number;
  recipients: number;
  skipped?: string;
  failures: string[];
};

/**
 * The weekly send. With `onlyTo` it goes to that address alone and sends even
 * when there is nothing to report (the "send me a test" button); otherwise it
 * goes to every preset user and is skipped on a quiet week.
 */
export async function sendWarrantyReminders(onlyTo?: string): Promise<WarrantyReminderResult> {
  const { buckets } = await loadWarrantyBuckets();
  const needsAttention =
    buckets.expired.length + buckets.d30.length + buckets.d60.length + buckets.d90.length;
  if (!onlyTo && needsAttention === 0) {
    return { sent: 0, recipients: 0, skipped: "Nothing is expired or expiring within 90 days.", failures: [] };
  }

  const to = onlyTo ? [onlyTo] : await warrantyRecipients();
  if (to.length === 0) {
    return { sent: 0, recipients: 0, skipped: "Nobody has the HR & Admin preset, so there is no one to email.", failures: [] };
  }

  const html = buildWarrantyHtml(buckets);
  const subject = `[${APP_NAME}] Warranty & Renewals: ${buckets.expired.length} expired, ${buckets.d30.length} within 30 days`;
  let sent = 0;
  const failures: string[] = [];
  for (const address of to) {
    const result = await sendEmail({ to: address, subject, html });
    if (result.ok) sent++;
    else failures.push(result.message);
  }
  return { sent, recipients: to.length, failures: Array.from(new Set(failures)) };
}

/** True when Resend is set up, so the page can say whether reminders can go out. */
export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
