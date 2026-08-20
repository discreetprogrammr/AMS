import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for code that runs with no signed-in user at all —
// currently just the PM-due cron job (app/api/cron/pm-due/route.ts).
// Deliberately NOT built on @supabase/ssr's createServerClient (lib/supabase/
// server.ts): that one reads the session out of request cookies, and a cron
// invocation has no cookies/session to read. This uses the service role key
// instead, which bypasses RLS entirely — so every query this client makes
// is trusted, unrestricted, server-only code. Never import this into
// anything that runs in the browser, and never let SUPABASE_SERVICE_ROLE_KEY
// leak into a NEXT_PUBLIC_ variable.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createServiceRoleClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
