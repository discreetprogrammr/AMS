import { NextRequest, NextResponse } from "next/server";
import { getProfile, isSuperAdminRole } from "@/lib/supabase/profile";
import { sendWeeklyDigest } from "@/lib/report-digest";

// Weekly staff ops digest. Same dual-auth shape as the other four cron
// routes (pm-due, sla-check, compliance-check, low-stock-check) — Vercel
// Cron hits this with a CRON_SECRET bearer token on schedule; a signed-in
// Super Admin can also hit it directly for demos/testing.
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
    const result = await sendWeeklyDigest();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/weekly-digest] run failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
