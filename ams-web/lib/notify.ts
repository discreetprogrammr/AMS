// Notifications alongside the existing in-app alerts/bell — SLA breaches,
// upcoming PM, and ticket status changes, over TWO channels: email
// (lib/email.ts, Resend) and browser push (lib/push.ts, Web Push). Every
// function here is fire-and-forget from the caller's point of view:
// failures are caught and logged, never thrown, so a misconfigured/down
// provider on either channel can't break the automation or action it's
// attached to.
//
// Two different recipient shapes, on purpose:
//  - SLA/PM notifications go to staff. Email goes to one configurable
//    distribution address (STAFF_NOTIFICATION_EMAIL) — profiles doesn't
//    store an email (that lives in auth.users), and for an internal ops
//    alert, routing to a shared inbox is the normal pattern anyway, not
//    per-technician subscriptions. Push is naturally per-device though, so
//    it goes to every subscribed staff member individually (sendPushToStaff,
//    lib/push.ts) rather than needing its own distribution concept.
//  - Ticket status change goes to the SPECIFIC client who raised it, on
//    both channels — email via auth.admin.getUserById() (service-role
//    only; a single targeted lookup, not a full user list), push via
//    whatever devices that same user has subscribed.
import { sendEmail } from "./email";
import { sendPushToStaff, sendPushToUser } from "./push";
import { createServiceRoleClient } from "./supabase/service-role";
import { ticketRef, assetLabel } from "./format";

const APP_NAME = "HorizonCare360";

// Exported so lib/report-digest.ts (Scheduled report digests) can reuse the
// exact same header/footer chrome instead of a second copy drifting out of
// sync with this one.
export function wrapEmail(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
      <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin: 0 0 6px;">${APP_NAME} — Pacific Horizon Tek</p>
      <h2 style="margin: 0 0 14px; font-size: 18px;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
        Automated notification — this mailbox isn't monitored for replies.
      </p>
    </div>
  `;
}

// SLA breach/approaching (lib/sla-escalation.ts) and PM due (lib/pm-automation.ts)
// share the same shape and the same staff-distribution recipient, so one
// function covers both — each caller just passes the title/description it
// already built for the in-app alert row, so the wording never drifts
// between the bell and the inbox.
export async function notifyStaff(title: string, description: string): Promise<void> {
  // Email and push are independent channels — one being unconfigured (or
  // failing) shouldn't stop the other from trying. sendEmail()/
  // sendPushToStaff() both already no-op quietly if their own env vars
  // aren't set, so nothing extra needed here beyond just calling both.
  const to = process.env.STAFF_NOTIFICATION_EMAIL;
  if (to) {
    const result = await sendEmail({
      to,
      subject: `[${APP_NAME}] ${title}`,
      html: wrapEmail(title, `<p>${description}</p>`),
    });

    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error("[notify] Staff email failed:", result.message);
    }
  }

  await sendPushToStaff({ title, body: description, url: "/alerts" });
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  parts_pending: "Parts Pending",
  closed: "Closed",
};

// Site + serial number instead of the raw asset tag — same reasoning as
// assetLabel()'s own doc comment (lib/format.ts): more meaningful to a
// client than an internal asset_tag code they never see anywhere else.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assetDisplayOf(assets: any): string {
  if (!assets) return "your equipment";
  const asset = Array.isArray(assets) ? assets[0] : assets;
  if (!asset) return "your equipment";
  const sites = Array.isArray(asset.sites) ? asset.sites[0] : asset.sites;
  return assetLabel({ ...asset, sites });
}

// Ticket status change — notifies the client who raised it, if it was a
// client (a staff-raised ticket has nobody external waiting on an update
// email). Called from every place a ticket's status actually changes:
// app/assets/tickets-actions.ts's acknowledgeTicket/resolveTicket/
// markTicketPartsPending/updateTicketStatus, and app/work-orders/actions.ts's
// updateWorkOrderStatus (which mirrors its status onto a linked ticket).
export async function notifyTicketStatusChange(
  ticketId: string,
  newStatus: string,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();

    const { data: ticket } = await supabase
      .from("service_tickets")
      .select("raised_by, description, assets(asset_tag, serial_number, sites(address))")
      .eq("id", ticketId)
      .single();

    if (!ticket?.raised_by) return;

    const { data: raiserProfile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", ticket.raised_by)
      .single();

    if (!raiserProfile || raiserProfile.role !== "client_viewer") return;

    const ref = ticketRef(ticketId);
    const statusLabel = STATUS_LABEL[newStatus] ?? newStatus;
    const assetDisplay = assetDisplayOf(ticket.assets);

    // Email and push are independent channels here too — a missing/looked-up
    // email shouldn't stop the push send, and vice versa.
    const { data: userResult } = await supabase.auth.admin.getUserById(ticket.raised_by);
    const email = userResult?.user?.email;

    if (email) {
      const result = await sendEmail({
        to: email,
        subject: `[${APP_NAME}] ${ref} is now ${statusLabel}`,
        html: wrapEmail(
          `${ref} updated`,
          `<p>Hi ${raiserProfile.full_name ?? "there"},</p>
           <p>Your service ticket for <strong>${assetDisplay}</strong> is now <strong>${statusLabel}</strong>.</p>
           ${ticket.description ? `<p style="color:#64748b;">"${ticket.description}"</p>` : ""}`,
        ),
      });

      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error("[notify] Ticket status email failed:", result.message);
      }
    }

    await sendPushToUser(ticket.raised_by, {
      title: `${ref} is now ${statusLabel}`,
      body: `Your service ticket for ${assetDisplay} is now ${statusLabel}.`,
      url: "/tickets",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notify] Ticket status email failed:", err);
  }
}
