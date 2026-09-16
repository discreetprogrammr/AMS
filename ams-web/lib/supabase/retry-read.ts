// Retry wrapper for READ-ONLY Supabase queries that fail transiently.
//
// Why this exists: cron:compliance-check failed 8 times between 27 Aug and
// 16 Sep 2026 with "JWT issued at future" — Supabase rejecting the
// service-role token because its `issued at` claim was momentarily ahead of
// the auth server's clock. The token is not broken: lib/error-log.ts uses
// the same createServiceRoleClient() and successfully wrote the error row
// seconds later, every time. It is a transient server-side disagreement,
// not something this codebase can fix at the source.
//
// READ ONLY. Never wrap an insert, update, upsert or delete in this. The
// compliance/SLA/PM escalation ledgers are idempotent at the unique-index
// level, but that is a guarantee about duplicate *rows*, not a licence to
// replay arbitrary writes.
//
// Only compliance-check uses this today. The other four cron jobs
// (sla-check, pm-due, low-stock-check, weekly-digest) share the identical
// service-role client and are equally exposed; they simply have not tripped
// it yet. If one of them starts logging the same error, wrap its reads the
// same way rather than inventing a second mechanism.

const TRANSIENT_PATTERNS = [
  /JWT issued at future/i,
  /JWT is expired/i,
  /fetch failed/i,
  /network/i,
  /timed? ?out/i,
  /ECONNRESET/i,
];

function isTransient(message: string | undefined): boolean {
  if (!message) return false;
  return TRANSIENT_PATTERNS.some((re) => re.test(message));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ReadResult<T> = { data: T; error: { message: string } | null };

/**
 * Runs a read query, retrying only on transient failures.
 *
 * `run` must BUILD the query each time it is called. A Supabase query
 * builder is thenable and single-use, so passing an already-built query
 * would replay a settled promise and defeat the retry entirely.
 *
 *   await retryRead("certificates", () =>
 *     supabase.from("compliance_certificates").select("id"))
 */
export async function retryRead<T>(
  label: string,
  run: () => PromiseLike<ReadResult<T>>,
  attempts = 3,
): Promise<ReadResult<T>> {
  let result = await run();

  for (let attempt = 2; attempt <= attempts; attempt++) {
    if (!result.error || !isTransient(result.error.message)) return result;

    // 300ms, then 600ms. Short enough to stay well inside the function's
    // budget, long enough for a clock-skew window to pass.
    await sleep(300 * (attempt - 1));

    // eslint-disable-next-line no-console
    console.warn(
      `[retryRead] ${label}: transient failure (${result.error.message}), attempt ${attempt} of ${attempts}`,
    );
    result = await run();
  }

  return result;
}
