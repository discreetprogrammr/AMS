import { NextRequest, NextResponse } from "next/server";
import { getProfile, isSuperAdminRole } from "@/lib/supabase/profile";
import { runComplianceCheck } from "@/lib/compliance-alerts";

// Daily compliance certificate & warranty expiry sweep. Same dual-auth
// shape as app/api/cron/pm-due and app/api/cron/sla-check — Vercel Cron
// hits this with a CRON_SECRET bearer token on schedule; a signed-in Super
// Admin can also hit it directly for demos/testing.
//
// Once-daily is plenty here (unlike the SLA check, which needed an hourly
// GitHub Actions workaround) — certificate and warranty windows are
// measured in weeks, not hours, so Vercel Hobby's once-a-day cron cap
// isn't a meaningful gap for this one.
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
    const result = await runComplianceCheck();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/compliance-check] run failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
