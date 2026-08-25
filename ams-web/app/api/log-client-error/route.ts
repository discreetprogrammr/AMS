import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-log";

// Error Monitoring (schema_step43.sql) — the receiving end for
// app/global-error.tsx's crash report. A root error boundary is a Client
// Component (it has to be, per Next.js's App Router rules — it renders
// its own <html>/<body> in place of the whole app), so it can't call
// logError()/the service-role client directly the way every other
// instrumented catch block in this app does; it POSTs here instead and
// this route does the actual server-side logging.
//
// Deliberately no auth gate: a page can crash for ANY signed-in user
// (staff or client) or even mid-navigation before a session is fully
// established, and the crash still needs to be captured regardless of who
// hit it. logError() itself is what's staff-only (RLS on error_logs/alerts
// via the service-role client), not this endpoint.
export async function POST(request: NextRequest) {
  let body: { message?: string; stack?: string | null; digest?: string | null; url?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = typeof body.message === "string" && body.message.trim() ? body.message : "Unknown client error";

  // Rebuild an Error object server-side and overwrite its .stack with the
  // browser's own stack trace string (Error#stack is a plain writable
  // property) — logError() pulls source/message/stack directly off an
  // Error instance, and the stack captured by `new Error()` right here
  // would just point at this route handler, not the actual crash site in
  // the browser.
  const err = new Error(message);
  if (typeof body.stack === "string" && body.stack) {
    err.stack = body.stack;
  }

  await logError("client:render", err, {
    digest: body.digest ?? null,
    url: body.url ?? null,
  });

  return NextResponse.json({ ok: true });
}
