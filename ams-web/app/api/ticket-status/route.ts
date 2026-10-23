import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { notifyTicketStatusChange } from "@/lib/notify";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { applyTicketStatus, isTicketStatus } from "@/lib/ticket-status";

// Change a ticket's status, for the HorizonCare360 Assist mobile app, where a
// field engineer works tickets. The web app does this through server actions
// that need a web session (app/assets/tickets-actions.ts); the app has none, so
// it sends `Authorization: Bearer <Supabase access token>`, as it does for
// /api/turn-credentials and /api/call-notify.
//
// Why a route and not a plain table update from the app: a status change here does
// more than set a column. It stamps first_response_at and resolved_at (SLA
// reporting), mirrors the status onto a linked work order, and tells the client by
// email and push (notifyTicketStatusChange, which needs the service role on the
// server). A direct update from the phone would skip all of that.
//
// Who: a field engineer, admin or super admin. A client gets 403. The ticket is
// changed with the CALLER'S token, so row-level security and the field engineer
// column limit (schema_step57.sql) are what actually authorise it. See
// lib/ticket-status.ts for the one bounded use of the service role.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = ["field_engineer", "admin", "super_admin"];

function bearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { ticketId?: unknown; status?: unknown };
  try {
    body = (await request.json()) as { ticketId?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { ticketId, status } = body;
  if (typeof ticketId !== "string" || !UUID.test(ticketId) || !isTicketStatus(status)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // The caller's own client: every read and write below is theirs, so RLS applies.
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
    .select("role, hidden_modules")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  // The "HR & Admin" preset gets no ticket actions, as in the web app's actions.
  if (profile.role !== "super_admin" && isHrAdminPreset(profile.hidden_modules)) {
    return new Response("Forbidden", { status: 403 });
  }

  const result = await applyTicketStatus(supabase, ticketId, status);
  if (result === "not-found") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (result === "refused") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  // Tells the client who raised it, if it was a client. Never throws.
  await notifyTicketStatusChange(ticketId, status);

  return NextResponse.json({ ok: true, status }, { status: 200 });
}
