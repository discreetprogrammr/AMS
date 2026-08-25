import { NextRequest, NextResponse } from "next/server";
import { getProfile, isSuperAdminRole } from "@/lib/supabase/profile";
import { runSlaEscalationCheck } from "@/lib/sla-escalation";
import { logError } from "@/lib/error-log";

// Daily SLA breach escalation sweep. Same dual-auth shape as
// app/api/cron/pm-due/route.ts — see that file's comment for the full
// reasoning. Short version: Vercel Cron hits this with a `CRON_SECRET`
// bearer token on schedule; a signed-in Super Admin can also hit it
// directly for demos/testing.
//
// Worth knowing: on Vercel's Hobby plan, cron jobs can only run once a
// day (not hourly), so an 8h response-SLA breach may not get flagged until
// up to ~24h after it actually happens — better than the dashboard-only
// after-the-fact reporting this replaces, but not real-time. Upgrading to
// Pro (or pointing an external scheduler at this same URL with the
// CRON_SECRET) would allow hourly checks instead, without any code change
// here.
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
    const result = await runSlaEscalationCheck();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/sla-check] run failed:", err);
    await logError("cron:sla-check", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
