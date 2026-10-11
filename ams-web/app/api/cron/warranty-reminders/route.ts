import { NextRequest, NextResponse } from "next/server";
import { getProfile, isSuperAdminRole } from "@/lib/supabase/profile";
import { sendWarrantyReminders } from "@/lib/warranty-reminders";
import { logError } from "@/lib/error-log";

// Weekly Warranty & Renewals reminder to the HR & Admin preset users. Same
// dual-auth shape as the other cron routes: Vercel Cron hits this with the
// CRON_SECRET bearer token on schedule (vercel.json); a signed-in Super
// Admin can also hit it directly to test. It sits under /api/*, which the
// middleware matcher deliberately excludes, so it does its own check.
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
    const result = await sendWarrantyReminders();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/warranty-reminders] run failed:", err);
    await logError("cron:warranty-reminders", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
