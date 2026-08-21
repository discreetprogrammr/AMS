import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyStaff } from "@/lib/notify";

// Core logic for "Automated PM ticket generation" — instead of relying on
// someone remembering to check next_service_due, a daily cron job
// (app/api/cron/pm-due/route.ts) calls runPmAutoCheck() to find assets
// whose PM is due soon (or overdue) and auto-creates the three things a
// staff member would otherwise create by hand: a service ticket, a
// calendar event, and a heads-up alert. Kept in its own module (rather than
// inline in the route) so it can also be called from a manual
// Super-Admin-triggered path for demo/testing without duplicating logic.
const DEFAULT_LEAD_DAYS = 7;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PmAutoRunCreated = {
  assetId: string;
  assetTag: string;
  dueDate: string;
  overdue: boolean;
  ticketId: string;
  calendarEventId: string;
  alertId: string;
};

export type PmAutoCheckResult = {
  leadDays: number;
  horizon: string;
  checked: number;
  created: PmAutoRunCreated[];
  skipped: number;
  errors: { assetId: string; assetTag: string; message: string }[];
};

// Finds every asset with next_service_due on or before (today + leadDays) —
// this deliberately has no lower bound, so an asset that's already overdue
// (next_service_due in the past, meaning nobody logged a PM ticket for it
// in time) still gets caught, not just upcoming ones. Assets already marked
// unserviceable are skipped: there's no useful "next PM" for equipment
// that's been retired/condemned.
export async function runPmAutoCheck(): Promise<PmAutoCheckResult> {
  const supabase = createServiceRoleClient();
  const leadDays = Number(process.env.PM_REMINDER_LEAD_DAYS) || DEFAULT_LEAD_DAYS;
  const today = todayIsoDate();
  const horizon = addDaysIso(today, leadDays);

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id, asset_tag, next_service_due, status")
    .not("next_service_due", "is", null)
    .lte("next_service_due", horizon)
    .neq("status", "unserviceable");

  if (assetsError) {
    throw new Error(`Failed to load due assets: ${assetsError.message}`);
  }

  const created: PmAutoRunCreated[] = [];
  const errors: PmAutoCheckResult["errors"] = [];
  let skipped = 0;

  for (const asset of assets ?? []) {
    const dueDate = asset.next_service_due as string;

    // Idempotency check — the unique(asset_id, due_date) constraint on
    // pm_auto_runs is the real guarantee, but checking first avoids a
    // needless insert-and-fail round trip on every re-run.
    const { data: existingRun } = await supabase
      .from("pm_auto_runs")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("due_date", dueDate)
      .maybeSingle();

    if (existingRun) {
      skipped++;
      continue;
    }

    const overdue = dueDate < today;
    const description = overdue
      ? `Automated PM reminder — scheduled maintenance for ${asset.asset_tag} was due ${dueDate} and hasn't been logged yet.`
      : `Automated PM reminder — scheduled maintenance for ${asset.asset_tag} is due ${dueDate}.`;

    try {
      const { data: ticket, error: ticketError } = await supabase
        .from("service_tickets")
        .insert({
          asset_id: asset.id,
          raised_by: null,
          description,
          priority: overdue ? "high" : "medium",
          status: "open",
        })
        .select("id")
        .single();
      if (ticketError || !ticket) {
        throw new Error(ticketError?.message ?? "ticket insert returned no row");
      }

      const { data: event, error: eventError } = await supabase
        .from("calendar_events")
        .insert({
          asset_id: asset.id,
          ticket_id: ticket.id,
          title: `PM Due — ${asset.asset_tag}`,
          event_type: "maintenance",
          event_date: dueDate,
          notes: "Auto-scheduled by the PM reminder job.",
          created_by: null,
        })
        .select("id")
        .single();
      if (eventError || !event) {
        throw new Error(eventError?.message ?? "calendar event insert returned no row");
      }

      const { data: alert, error: alertError } = await supabase
        .from("alerts")
        .insert({
          asset_id: asset.id,
          title: `PM due soon — ${asset.asset_tag}`,
          description,
          severity: "caution",
          created_by: null,
        })
        .select("id")
        .single();
      if (alertError || !alert) {
        throw new Error(alertError?.message ?? "alert insert returned no row");
      }

      // Beyond the in-app alert/bell — same title/description. Non-fatal
      // (notifyStaff never throws): a missing/misconfigured RESEND_API_KEY
      // shouldn't block the auto-created ticket/calendar event/alert.
      await notifyStaff(
        `PM due soon — ${asset.asset_tag}`,
        description,
      );

      const { error: runError } = await supabase.from("pm_auto_runs").insert({
        asset_id: asset.id,
        due_date: dueDate,
        ticket_id: ticket.id,
        calendar_event_id: event.id,
        alert_id: alert.id,
      });
      if (runError) {
        throw new Error(runError.message);
      }

      created.push({
        assetId: asset.id,
        assetTag: asset.asset_tag,
        dueDate,
        overdue,
        ticketId: ticket.id,
        calendarEventId: event.id,
        alertId: alert.id,
      });
    } catch (err) {
      errors.push({
        assetId: asset.id,
        assetTag: asset.asset_tag,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { leadDays, horizon, checked: assets?.length ?? 0, created, skipped, errors };
}
