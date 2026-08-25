import { NextRequest, NextResponse } from "next/server";
import { getProfile, isSuperAdminRole } from "@/lib/supabase/profile";
import { runPmAutoCheck } from "@/lib/pm-automation";
import { logError } from "@/lib/error-log";

// Daily PM-due sweep (Automated PM ticket generation). Two ways in:
//
//  1. Vercel Cron (vercel.json) hits this on schedule with
//     `Authorization: Bearer ${CRON_SECRET}` — Vercel's documented
//     cron-auth pattern (a cron invocation has no user session, so it can't
//     rely on cookies/RLS like every other route in this app does).
//  2. A signed-in Super Admin can hit this URL directly (e.g. from the
//     browser) to run the sweep on demand — useful for demos ("watch it
//     create the ticket live") and for testing without waiting for the
//     next scheduled run. Gated on role instead of the secret, since a
//     logged-in browser tab has a session but no safe way to attach a
//     bearer secret.
//
// Either path is sufficient on its own; if CRON_SECRET isn't set yet (e.g.
// still being configured in Vercel), this safely falls back to requiring a
// Super Admin session rather than allowing open access.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasValidCronSecret = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (!hasValidCronSecret) {
    const profile = await getProfile();
    if (!isSuperAdminRole(profile?.role)) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
  }

  try {
    const result = await runPmAutoCheck();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/pm-due] run failed:", err);
    await logError("cron:pm-due", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
