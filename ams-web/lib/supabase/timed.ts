// TEMPORARY diagnostic helper — added to pin down a persistent 300s
// FUNCTION_INVOCATION_TIMEOUT on /dashboard that survived the region fix,
// the fetchWithTimeout wrapper, AND the @supabase/supabase-js /
// @supabase/ssr upgrade. Vercel's Logs UI doesn't expose per-call timing
// for the "External APIs" list (clicking a row just copies its path), so
// there's no way to see which of the ~20 concurrent Supabase calls on this
// page never resolves — this wraps each one so its start/finish shows up
// directly in Runtime Logs with a label and a duration.
//
// Safe to leave in briefly, but remove once the hang is found — this is
// debugging scaffolding, not a permanent pattern.
export async function timed<T>(label: string, promise: PromiseLike<T>): Promise<T> {
  const start = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[timing] ${label} START`);
  try {
    const result = await promise;
    // eslint-disable-next-line no-console
    console.log(`[timing] ${label} OK ${Date.now() - start}ms`);
    return result as T;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[timing] ${label} ERROR ${Date.now() - start}ms`, err);
    throw err;
  }
}
