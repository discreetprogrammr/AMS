// Server-side Web Push sending — the counterpart to lib/email.ts, but for
// browser push notifications instead of email. Unlike Resend (a single
// hosted HTTP API), Web Push has no such thing: every send is addressed
// directly to a specific browser's push endpoint (Chrome's, Firefox's,
// Apple's, etc.) with a payload encrypted per RFC 8291 and a VAPID JWT for
// auth. The `web-push` npm package handles that protocol — there's no
// realistic fetch()-only equivalent the way there was for Resend.
//
// Same non-fatal contract as email throughout lib/notify.ts: every function
// here catches its own errors and never throws, so a misconfigured VAPID
// key or an unreachable push service can't break the SLA/PM/ticket-status
// action it's attached to.
import webpush from "web-push";
import { createServiceRoleClient } from "./supabase/service-role";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@phtek.com.ph";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendToRows(supabase: any, rows: SubscriptionRow[], payload: PushPayload): Promise<void> {
  const body = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
        );
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusCode = (err as any)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // The subscription is dead (browser data cleared, app uninstalled,
          // permission revoked, etc.) — clean it up so future sends don't
          // keep retrying an endpoint that will never accept mail again.
          await supabase.from("push_subscriptions").delete().eq("id", row.id);
        } else {
          // eslint-disable-next-line no-console
          console.error("[push] Send failed:", err instanceof Error ? err.message : err);
        }
      }
    }),
  );
}

// SLA/PM notifications — every subscribed staff device (admin or
// super_admin), not one shared address like the email side. Push is
// inherently per-device, so "one distribution channel" doesn't apply the
// way it does for STAFF_NOTIFICATION_EMAIL — each staff member who opts in
// gets it on their own phone/desktop.
export async function sendPushToStaff(payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  try {
    const supabase = createServiceRoleClient();

    const { data: staffProfiles } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"]);
    const staffIds = (staffProfiles ?? []).map((p: { id: string }) => p.id);
    if (!staffIds.length) return;

    const { data: rows } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", staffIds);
    if (!rows?.length) return;

    await sendToRows(supabase, rows, payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[push] Staff push failed:", err);
  }
}

// Ticket status change — the specific client who raised it, same targeting
// as notifyTicketStatusChange's email (lib/notify.ts).
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  try {
    const supabase = createServiceRoleClient();

    const { data: rows } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!rows?.length) return;

    await sendToRows(supabase, rows, payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[push] User push failed:", err);
  }
}
