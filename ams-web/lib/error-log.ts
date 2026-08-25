// Error Monitoring (schema_step43.sql). A single fire-and-forget capture
// point for unhandled app errors — call this from an existing catch block
// instead of letting a failure vanish into `console.error` or a swallowed
// {ok:false} return with nothing durable behind it.
//
// Two things happen on every call:
//   1. A row in the new `error_logs` table — full technical detail
//      (source, message, stack, context) for whoever digs in later.
//   2. A row in the existing `alerts` table, exactly like every other
//      automated alert source (SLA breaches, low stock, PM due —
//      lib/sla-escalation.ts, lib/low-stock-alerts.ts, lib/pm-automation.ts)
//      — so it shows up in the same /alerts feed staff already check, and
//      rides the same notifyStaff() email/push delivery. No second
//      notification path to build or forget to wire up.
//
// Uses the service-role client rather than a request-scoped session
// client for the same reason the cron jobs do (lib/supabase/service-role.ts):
// an error can happen under ANY caller's session — a client user's own
// server action, a staff member's, or no session at all during a cron
// run — and logging it should never depend on, or be blocked by, whatever
// RLS permissions that particular caller happens to have.
//
// logError() itself must never throw. It's meant to be dropped into an
// existing catch block right next to (or instead of) a console.error —
// if the *logging* fails too (e.g. Supabase is down), the original error
// still needs to propagate/return normally, so every failure path here
// falls back to console.error instead of raising.
import { createServiceRoleClient } from "./supabase/service-role";
import { notifyStaff } from "./notify";

export async function logError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? null) : null;

    const supabase = createServiceRoleClient();

    // Same shape as every other automated alert (asset_id null — an error
    // isn't tied to one piece of equipment — severity always "critical",
    // since an unhandled error is by definition something nobody
    // acknowledged or expected).
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .insert({
        asset_id: null,
        title: `Error: ${source}`,
        description: message,
        severity: "critical",
        created_by: null,
      })
      .select("id")
      .single();

    if (alertError) {
      // eslint-disable-next-line no-console
      console.error("[error-log] failed to raise alert for", source, alertError.message);
    }

    const { error: logInsertError } = await supabase.from("error_logs").insert({
      source,
      message,
      stack,
      context: context ?? null,
      alert_id: alert?.id ?? null,
    });

    if (logInsertError) {
      // eslint-disable-next-line no-console
      console.error("[error-log] failed to persist error_logs row for", source, logInsertError.message);
    }

    // Non-fatal — notifyStaff() already never throws (lib/notify.ts), same
    // title/description as the alert row so the email/push never says
    // anything different from what's in the Alerts tab.
    await notifyStaff(`Error: ${source}`, message);
  } catch (loggingErr) {
    // Logging itself must never break the caller's own error handling —
    // worst case this is only as visible as Vercel's function logs, same
    // as before this feature existed.
    // eslint-disable-next-line no-console
    console.error("[error-log] logError() itself failed for", source, loggingErr);
  }
}
