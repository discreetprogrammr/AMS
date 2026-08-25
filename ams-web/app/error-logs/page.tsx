import { createClient } from "@/lib/supabase/server";
import { getProfile, requireSuperAdmin } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ErrorLogsFeed, type ErrorLogRow } from "./error-logs-feed";
import { triggerTestError } from "./actions";

// Error Monitoring (schema_step43.sql). Super Admin-only — see
// app/error-logs/actions.ts's doc comment for why this is narrower than
// /alerts (raw stack traces/context, not an everyday ops surface — every
// error here also raises a normal staff-visible alert on /alerts).
export default async function ErrorLogsPage({
  searchParams,
}: {
  searchParams: { test?: string };
}) {
  await requireSuperAdmin();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: logs, error } = await supabase
    .from("error_logs")
    .select("id, source, message, stack, context, resolved, resolved_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: ErrorLogRow[] = (logs ?? []) as ErrorLogRow[];

  return (
    <AppShell
      profile={profile}
      title="Error Logs"
      subtitle="Unhandled app errors — server actions, API routes, cron runs, and client-side crashes. Every entry here also raises a staff alert."
      actions={
        <form action={triggerTestError}>
          <button
            type="submit"
            className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2"
          >
            Send Test Error
          </button>
        </form>
      }
    >
      {searchParams?.test === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Test error sent — check below, plus the Alerts tab and your email/push if configured.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}
      <ErrorLogsFeed logs={rows} />
    </AppShell>
  );
}
