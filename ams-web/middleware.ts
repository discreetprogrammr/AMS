import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Excludes /api/* from the login-redirect middleware — API routes
  // (including app/api/cron/pm-due and app/api/cron/sla-check) each do
  // their own auth check already (CRON_SECRET bearer token or a Super
  // Admin session), same as this app's stated philosophy that RLS/explicit
  // checks are the real security boundary, not this redirect. Without this
  // exclusion, any caller with no browser session cookie — Vercel's actual
  // Cron trigger included, not just curl/testing — got bounced to /login
  // (an HTML page, not JSON) before the route handler ever ran, silently
  // breaking both scheduled cron jobs outside of manual Super-Admin
  // browser testing.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
