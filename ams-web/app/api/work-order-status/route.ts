import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { notifyTicketStatusChange } from "@/lib/notify";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { isTicketStatus } from "@/lib/ticket-status";
import { applyWorkOrderStatus } from "@/lib/work-order-status";

// Change a work order's status, for the HorizonCare360 Assist mobile app, where a field
// engineer works the jobs assigned to them. The sibling of /api/ticket-status: the web
// app does this through a server action that needs a web session
// (app/work-orders/actions.ts), the app has none, so it sends
// `Authorization: Bearer <Supabase access token>`.
//
// A work order's status change is more than a column: it stamps closed_at, keeps the
// calendar event in step, mirrors onto the ticket the job was created from, and tells
// the client who raised that ticket. See lib/work-order-status.ts.
//
// Who: a field engineer, admin or super admin. A client gets 403. A field engineer can
// change only the work orders assigned to them, which row-level security and the column
// limit in schema_step57.sql enforce, not this route.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = ["field_engineer", "admin", "super_admin"];

function bearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { workOrderId?: unknown; status?: unknown };
  try {
    body = (await request.json()) as { workOrderId?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { workOrderId, status } = body;
  // Work orders and tickets share one status vocabulary (schema_step21.sql).
  if (typeof workOrderId !== "string" || !UUID.test(workOrderId) || !isTicketStatus(status)) {
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
  // The "HR & Admin" preset gets no work order actions, as in the web app.
  if (profile.role !== "super_admin" && isHrAdminPreset(profile.hidden_modules)) {
    return new Response("Forbidden", { status: 403 });
  }

  const outcome = await applyWorkOrderStatus(supabase, workOrderId, status);
  if (outcome.result === "not-found") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (outcome.result === "refused") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  // Tells the client who raised the linked ticket, if it was a client. Never throws.
  if (outcome.linkedTicketId) await notifyTicketStatusChange(outcome.linkedTicketId, status);

  return NextResponse.json({ ok: true, status }, { status: 200 });
}
