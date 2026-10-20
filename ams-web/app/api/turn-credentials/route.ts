import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { forbidHrAdminPreset } from "@/lib/hr-admin-guard";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";

// Short-lived ICE server list (STUN + TURN) for the calling feature's
// RTCPeerConnection — fetched server-side so the Metered API key never
// reaches the browser. Auth-gated (not RLS — this doesn't touch the
// database at all) so a logged-out visitor can't spam our TURN quota.
//
// Two ways to prove who you are:
//   1. The web session cookie (the PWA, unchanged).
//   2. `Authorization: Bearer <Supabase access token>` (the HorizonCare360
//      Assist mobile app, which has no cookie). The token is verified with
//      Supabase (auth.getUser(token)), not merely decoded.
// If a bearer header is present it is used and the cookie is ignored.
//
// METERED_APP_NAME / METERED_API_KEY come from a free Metered.ca TURN
// Server Service account (dashboard.metered.ca) — see the "Set up
// calling" note in README.md. Until those env vars are set, this falls
// back to a public STUN-only server: calls will still connect on the
// same wifi/network, but won't reliably work over mobile data or behind
// strict firewalls, which is exactly what a TURN relay fixes.

function bearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

// Returns a response to send back (401 or 403), or null when the caller is
// allowed to receive ICE servers.
async function rejectUnlessAllowed(request: Request): Promise<Response | null> {
  const token = bearerToken(request);

  if (token) {
    // A throwaway client carrying the caller's own token, so every read below
    // is the caller's own (RLS applies). No session is kept, and no
    // service-role key is involved.
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // Same rule as forbidHrAdminPreset(): HR & Admin preset users get nothing
    // from client-facing routes. A profile that cannot be read is treated as
    // not allowed rather than waved through.
    const { data: profile } = await supabase
      .from("profiles")
      .select("hidden_modules")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || isHrAdminPreset(profile.hidden_modules)) {
      return new Response("Forbidden", { status: 403 });
    }
    return null;
  }

  // Cookie path, exactly as before.
  const forbidden = await forbidHrAdminPreset();
  if (forbidden) return forbidden;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const rejected = await rejectUnlessAllowed(request);
  if (rejected) return rejected;

  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  // X-Ice-Mode isn't part of the WebRTC contract (RTCPeerConnection just
  // wants the JSON array) — it's purely a diagnostic breadcrumb so
  // use-call.ts can log/surface WHY a call is TURN-less, instead of a call
  // silently falling back to STUN-only with zero visible signal. A call
  // stuck on "Connecting…" forever is exactly what STUN-only + two
  // different networks (e.g. wifi + cellular) looks like.
  if (!appName || !apiKey) {
    return NextResponse.json(
      [{ urls: "stun:stun.l.google.com:19302" }],
      { headers: { "X-Ice-Mode": "stun-fallback-unconfigured" } },
    );
  }

  try {
    const res = await fetch(
      `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      throw new Error(`Metered API returned ${res.status}`);
    }

    const iceServers = await res.json();
    return NextResponse.json(iceServers, { headers: { "X-Ice-Mode": "turn" } });
  } catch (err) {
    // Same graceful fallback as the "not configured" case above — a
    // transient Metered outage shouldn't hard-block same-network calls.
    // eslint-disable-next-line no-console
    console.error("[turn-credentials] Metered fetch failed, falling back to STUN-only:", err);
    return NextResponse.json(
      [{ urls: "stun:stun.l.google.com:19302" }],
      { headers: { "X-Ice-Mode": "stun-fallback-error" } },
    );
  }
}
