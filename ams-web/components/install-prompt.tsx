"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "hc360-install-dismissed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = any;

// Chrome/Edge/Android fire `beforeinstallprompt` when the manifest + service
// worker install criteria are met — this listens for it, holds onto the
// event (browsers only let you call .prompt() once, and only in response
// to this specific event), and shows a small dismissible bar offering to
// trigger the native install flow.
//
// iOS Safari never fires this event — there's no programmatic install
// prompt there, only the user's own Share -> "Add to Home Screen." Safari
// does still pick up the manifest/icons (app/layout.tsx's appleWebApp meta
// + apple-touch-icon), so installing still works there, just not via this
// banner. Nothing to do about that from the web app's side.
export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // default hidden until checked, avoids a flash

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");

    function handler(e: Event) {
      e.preventDefault();
      setDeferredEvent(e);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredEvent || dismissed) return null;

  async function handleInstall() {
    await deferredEvent.prompt();
    // The browser's own choice dialog resolves here regardless of accept/
    // dismiss — either way this specific event can't be reused, so clear it.
    setDeferredEvent(null);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9998] flex items-center justify-between gap-3 border-t border-hairline bg-surface px-4 py-3 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-xl sm:border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Install HorizonCare360</p>
        <p className="text-xs text-slate-500">Add it to your home screen for quick access.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-ink-soft"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={handleInstall}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-ink hover:bg-blue-500"
        >
          Install
        </button>
      </div>
    </div>
  );
}
