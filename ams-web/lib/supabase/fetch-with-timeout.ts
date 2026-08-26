// Every Supabase client in this app (server.ts, middleware.ts, client.ts,
// service-role.ts) routes its HTTP calls through this. Without it, a single
// stalled request — e.g. Supabase's connection pooler queueing a request
// for a connection it never hands back, which has happened repeatedly on
// their status page recently — just hangs with no error and no timeout of
// its own, taking the whole page down with it until Vercel's *own* function
// timeout kills the entire request 5 minutes later (this is exactly what
// happened to /dashboard: 18+ queries fired in parallel, one of them never
// resolved or rejected, so `Promise.all` never settled, so the whole page
// sat there loading until Vercel force-killed it).
//
// This makes any single stalled request fail fast instead — the page then
// throws a normal, fast error (caught by app/global-error.tsx, which also
// logs it to error_logs per the Error Monitoring feature) instead of
// hanging silently for minutes. The user sees an error in ~20s and can just
// retry, rather than staring at a blank loading screen indefinitely.
const SUPABASE_FETCH_TIMEOUT_MS = 20_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}
