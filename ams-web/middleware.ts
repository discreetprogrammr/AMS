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
  // sw.js/manifest.webmanifest added 2026-09-07 — both are public files at
  // the app root (not under _next/static, so the existing exclusion missed
  // them), and the browser fetches them unauthenticated (service worker
  // registration, PWA install checks). Without this, an unauthenticated
  // request for /sw.js got redirected to /login by this same middleware,
  // and registering a service worker against a redirected response is
  // disallowed — that's what "Service worker registration failed... this
  // resource is behind a redirect" in the console was.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
