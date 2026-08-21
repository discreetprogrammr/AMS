"use client";

import { useEffect } from "react";

// Registers public/sw.js on every page load — this alone is most of what's
// needed for Chrome/Edge/Android to consider the app "installable" (a
// manifest + a service worker with a fetch handler is the baseline install
// criteria), and it's also the foundation push notifications run on (a
// push subscription is created against this same registration — see
// components/push-subscribe-button.tsx). Renders nothing; this is pure
// side effect on mount.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[pwa] Service worker registration failed:", err);
    });
  }, []);

  return null;
}
