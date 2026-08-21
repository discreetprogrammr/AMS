"use client";

import { useEffect, useState } from "react";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push-actions";

// Small icon-button in the Topbar (next to the theme toggle) that toggles
// Web Push on/off for this device. One button covers both directions:
// subscribe if not currently subscribed, unsubscribe if already are.
//
// Renders nothing if the browser doesn't support Push (older Safari, some
// in-app browsers) — same graceful-absence approach as the QR scanner's
// "no-camera" fallback, just without needing a visible fallback message
// here since this is an optional convenience, not the point of the page.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "checking" | "unsupported" | "subscribed" | "unsubscribed" | "denied";

export function PushSubscribeButton() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      ) {
        setState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setState(existing ? "subscribed" : "unsubscribed");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
      });

      const json = subscription.toJSON();
      await subscribeToPush({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      setState("subscribed");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[push] Enable failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await unsubscribeFromPush(endpoint);
      }
      setState("unsubscribed");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[push] Disable failed:", err);
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking" || state === "unsupported") return null;

  if (state === "denied") {
    return (
      <span
        title="Notifications are blocked for this site in your browser settings."
        className="rounded-lg p-2 text-slate-600"
      >
        <BellOffIcon />
      </span>
    );
  }

  const subscribed = state === "subscribed";

  return (
    <button
      type="button"
      onClick={subscribed ? handleDisable : handleEnable}
      disabled={busy}
      title={subscribed ? "Turn off push notifications on this device" : "Enable push notifications on this device"}
      className={`rounded-lg p-2 transition-colors disabled:opacity-50 ${
        subscribed ? "text-blue-400 hover:bg-surface-2" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {subscribed ? <BellIcon /> : <BellOffIcon />}
    </button>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M6 8a6 6 0 0 1 10.3-4.2M18 8c0 7 3 9 3 9H8m-5 0s3-2 3-9c0-.6.06-1.16.17-1.7M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20" />
    </svg>
  );
}
