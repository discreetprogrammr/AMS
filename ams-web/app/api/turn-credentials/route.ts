import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Short-lived ICE server list (STUN + TURN) for the calling feature's
// RTCPeerConnection — fetched server-side so the Metered API key never
// reaches the browser. Auth-gated (not RLS — this doesn't touch the
// database at all) so a logged-out visitor can't spam our TURN quota.
//
// METERED_APP_NAME / METERED_API_KEY come from a free Metered.ca TURN
// Server Service account (dashboard.metered.ca) — see the "Set up
// calling" note in README.md. Until those env vars are set, this falls
// back to a public STUN-only server: calls will still connect on the
// same wifi/network, but won't reliably work over mobile data or behind
// strict firewalls, which is exactly what a TURN relay fixes.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

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
