"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startRingtone, stopRingtone, unlockAudioOnFirstInteraction } from "@/lib/sounds";
import { ticketRef } from "@/lib/format";

// A banner with a ring and an Answer button, on every staff page, when a client
// calls from the HorizonCare360 Assist mobile app.
//
// Why: a call is only heard by the ticket page that is open
// (lib/webrtc/use-call.ts listens on `call:${ticketId}`), and engineers are
// rarely sitting on one ticket. Push notifications cover a closed tab; this
// covers an engineer who has the web app open on any other page.
//
// What drives it: /api/call-notify writes a row to call_alerts when a call
// starts ("started") and when nobody answers ("missed") (schema_step55.sql).
// The banner clears when a "missed" row arrives for that call, when any call
// row (answered, declined, ended, missed) is written to `messages` for that
// ticket, or after RING_WINDOW_MS. Answer opens the ticket, where the page
// rings and connects from the app's repeated `invite-retry` as it does today.
//
// It stays silent on the ticket page itself, because that page rings by
// itself. Mounted from AppShell, so it remounts on every navigation, like
// messages-unread-dot.tsx; it re-reads recent rows on mount instead of keeping
// state across pages. Realtime applies RLS, so only staff hear call_alerts.
// Renders nothing when no call is ringing.

// The app rings for up to 45 seconds; a little extra covers a late first row.
const RING_WINDOW_MS = 50_000;

type CallKind = "audio" | "video";

type Alert = {
  callId: string;
  ticketId: string;
  kind: CallKind;
  callerName: string;
  label: string;
  expiresAt: number;
};

type AlertRow = {
  call_id: string;
  ticket_id: string;
  kind: CallKind;
  event: "started" | "missed";
  caller_name: string | null;
  label: string | null;
  created_at: string;
};

function toAlert(row: AlertRow, startedAt: number): Alert {
  return {
    callId: row.call_id,
    ticketId: row.ticket_id,
    kind: row.kind,
    callerName: row.caller_name?.trim() || "A client",
    label: row.label?.trim() || "",
    expiresAt: startedAt + RING_WINDOW_MS,
  };
}

function PhoneIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

function VideoIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m23 7-7 5 7 5V7Z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

export function IncomingCallBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const supabase = useRef(createClient()).current;
  const ringing = useRef(false);

  useEffect(() => {
    unlockAudioOnFirstInteraction();
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Rebuild what is ringing right now, for a page opened mid-call.
    async function loadRecent() {
      const since = new Date(Date.now() - RING_WINDOW_MS).toISOString();
      const [{ data: rows }, { data: events }] = await Promise.all([
        supabase
          .from("call_alerts")
          .select("call_id, ticket_id, kind, event, caller_name, label, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: true }),
        supabase.from("messages").select("ticket_id, created_at").neq("message_type", "text").gte("created_at", since),
      ]);
      if (cancelled) return;

      const alertRows = (rows ?? []) as AlertRow[];
      const missedCalls = new Set(alertRows.filter((r) => r.event === "missed").map((r) => r.call_id));
      const eventTimes = new Map<string, number[]>();
      for (const e of events ?? []) {
        const list = eventTimes.get(e.ticket_id as string) ?? [];
        list.push(Date.parse(e.created_at as string));
        eventTimes.set(e.ticket_id as string, list);
      }

      const active: Alert[] = [];
      for (const row of alertRows) {
        if (row.event !== "started" || missedCalls.has(row.call_id)) continue;
        const startedAt = Date.parse(row.created_at);
        const answeredOrEnded = (eventTimes.get(row.ticket_id) ?? []).some((t) => t > startedAt);
        if (!answeredOrEnded) active.push(toAlert(row, startedAt));
      }
      setAlerts((prev) => {
        const known = new Set(prev.map((a) => a.callId));
        return [...prev, ...active.filter((a) => !known.has(a.callId))];
      });
    }
    loadRecent();

    const channel = supabase
      .channel("incoming-call-banner")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_alerts" }, (payload) => {
        const row = payload.new as AlertRow;
        if (row.event === "missed") {
          setAlerts((prev) => prev.filter((a) => a.callId !== row.call_id));
          return;
        }
        // Use the arrival time, not the row's, so a wrong clock cannot hide a ringing call.
        setAlerts((prev) => (prev.some((a) => a.callId === row.call_id) ? prev : [...prev, toAlert(row, Date.now())]));
      })
      // Any call row on a ticket means the call was answered, declined, ended or missed.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (payload.new.message_type === "text") return;
        const ticketId = payload.new.ticket_id as string;
        setAlerts((prev) => prev.filter((a) => a.ticketId !== ticketId));
      })
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
  }, [supabase]);

  // Drop an alert once its ring window has passed.
  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setAlerts((prev) => {
        const next = prev.filter((a) => a.expiresAt > now);
        return next.length === prev.length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [alerts.length]);

  // The ticket's own page rings for itself, so it is not repeated here.
  const visible = alerts.filter((a) => !dismissed.has(a.callId) && pathname !== `/messages/${a.ticketId}`);

  // Only stop a ring this banner started: the ticket page owns its own.
  useEffect(() => {
    if (visible.length > 0 && !ringing.current) {
      ringing.current = true;
      startRingtone();
    } else if (visible.length === 0 && ringing.current) {
      ringing.current = false;
      stopRingtone();
    }
  }, [visible.length]);

  useEffect(() => {
    return () => {
      if (ringing.current) {
        ringing.current = false;
        stopRingtone();
      }
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      {visible.map((a) => (
        <div
          key={a.callId}
          role="alert"
          aria-live="assertive"
          className="flex w-full max-w-lg flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/40 bg-surface px-4 py-3 shadow-2xl sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-3 text-sm text-blue-200">
            {a.kind === "video" ? <VideoIcon className="h-5 w-5 shrink-0" /> : <PhoneIcon className="h-5 w-5 shrink-0" />}
            <span className="min-w-0">
              <strong className="break-words">{a.callerName}</strong> is calling ({a.kind === "video" ? "video" : "voice"})
              <span className="block break-words text-xs text-ink-soft">
                {ticketRef(a.ticketId)}
                {a.label ? ` · ${a.label}` : ""}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(a.callId))}
              className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-2"
            >
              Dismiss
            </button>
            <Link
              href={`/messages/${a.ticketId}`}
              onClick={() => setDismissed((prev) => new Set(prev).add(a.callId))}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-ink hover:bg-emerald-500"
            >
              Answer
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
