import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendPushToStaff } from "@/lib/push";
import { sendEmail } from "@/lib/email";
import { wrapEmail } from "@/lib/notify";
import { ticketRef, assetLabel } from "@/lib/format";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";

// A client is calling (or a call went unanswered): tell staff, wherever they
// are in the web app, so they can open the ticket and answer.
//
// Why this exists: a call is only heard by the ticket page that is open
// (lib/webrtc/use-call.ts listens on `call:${ticketId}`), and engineers are
// rarely sitting on one ticket. The HorizonCare360 Assist mobile app calls
// this route when a client starts a call, and again if nobody answers.
//
// Auth is a Supabase access token as `Authorization: Bearer <token>`, same as
// /api/turn-credentials. The ticket is read with the CALLER'S token, so RLS
// decides whether they may talk about it: a client can only raise this for a
// ticket on their own organisation's assets. No service-role key is used here;
// the push helper that sends to staff uses its own, server side, as it already
// does for SLA and PM alerts.

const RECENT_WINDOW_MS = 15_000;
// Best effort only: this memory is per server instance and is lost on a cold
// start, so it limits a client hammering the route but is not a guarantee.
// A durable limit would need a small table.
const recent = new Map<string, number>();

function bearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { ticketId?: unknown; callId?: unknown; kind?: unknown; event?: unknown };

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { ticketId, callId, kind, event } = body;
  if (
    typeof ticketId !== "string" ||
    !UUID.test(ticketId) ||
    typeof callId !== "string" ||
    callId.length === 0 ||
    callId.length > 100 ||
    (kind !== "audio" && kind !== "video") ||
    (event !== "started" && event !== "missed")
  ) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // The caller's own client: every read below is theirs, so RLS applies.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, hidden_modules")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || isHrAdminPreset(profile.hidden_modules)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Not found and not yours look the same on purpose.
  const { data: ticket } = await supabase
    .from("service_tickets")
    .select("id, assets(asset_tag, serial_number, sites(address))")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const key = `${user.id}:${ticketId}:${event}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < RECENT_WINDOW_MS) {
    return NextResponse.json({ ok: true, throttled: true }, { status: 202 });
  }
  recent.set(key, now);
  // Keep the map small.
  if (recent.size > 500) {
    for (const [k, t] of recent) if (now - t > RECENT_WINDOW_MS) recent.delete(k);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetRow = Array.isArray((ticket as any).assets) ? (ticket as any).assets[0] : (ticket as any).assets;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites = Array.isArray(assetRow?.sites) ? assetRow.sites[0] : assetRow?.sites;
  const where = assetLabel(assetRow ? { ...assetRow, sites } : null);

  const who = profile.full_name?.trim() || "A client";
  const what = kind === "video" ? "video" : "voice";
  const ref = ticketRef(ticketId);
  const url = `/messages/${ticketId}`;

  try {
    if (event === "started") {
      await sendPushToStaff({
        title: `Incoming ${what} call`,
        body: `${who} is calling about ${ref} (${where}). Open the ticket to answer.`,
        url,
      });
    } else {
      await sendPushToStaff({
        title: `Missed ${what} call`,
        body: `${who} called about ${ref} (${where}) and no one answered. Please call back.`,
        url,
      });
      // A missed call also goes to the ops inbox, like other staff alerts.
      const to = process.env.STAFF_NOTIFICATION_EMAIL;
      if (to) {
        await sendEmail({
          to,
          subject: `[HorizonCare360] Missed ${what} call, ${ref}`,
          html: wrapEmail(
            `Missed ${what} call`,
            `<p>${who} called about ${ref} (${where}) and no one answered. Please call back.</p>`,
          ),
        });
      }
    }
  } catch (err) {
    // The mobile app does not wait on this and must not fail because of it.
    // eslint-disable-next-line no-console
    console.error("[call-notify] Notification failed:", err);
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
