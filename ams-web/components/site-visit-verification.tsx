"use client";

// "Site Visit Verification" tiles from the reference's PM checklist —
// GPS check-in / QR scan / customer confirmation / photo evidence, each a
// manual toggle the technician taps during the walkthrough. Same as the
// reference's own implementation, these aren't wired to real GPS/QR/camera
// hardware and aren't persisted on submit — it's a visual sign-off aid
// (the "did you actually do these things" checklist), matching what the
// reference itself does (its own `checks` state never appears in that
// form's save payload either).
import { useState } from "react";

type CheckKey = "gps" | "qr" | "confirm" | "photos";

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 10c0 6.5-9 12-9 12S3 16.5 3 10a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM19 18h2v2h-2zM14 19h2v2h-2z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const TILES: { key: CheckKey; label: string; desc: string; icon: () => JSX.Element }[] = [
  { key: "gps", label: "GPS Check-In", desc: "Capture geo-coordinates on arrival", icon: MapPinIcon },
  { key: "qr", label: "Scan asset QR tag", desc: "Confirms correct unit on-site", icon: QrIcon },
  { key: "confirm", label: "Request customer confirmation", desc: "Send SMS/e-mail confirmation", icon: ChatIcon },
  { key: "photos", label: "Photo Evidence", desc: "Nameplate / on-site condition", icon: CameraIcon },
];

export function SiteVisitVerification() {
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({
    gps: false,
    qr: false,
    confirm: false,
    photos: false,
  });
  const verifiedCount = Object.values(checks).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Site Visit Verification
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Proof the visit was physically conducted — required before sign-off
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {verifiedCount} / 4 checks
          </span>
          <span
            className={`rounded-md px-2 py-1 text-[10px] font-semibold tracking-wider ${
              verifiedCount === 4
                ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30"
                : "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30"
            }`}
          >
            {verifiedCount === 4 ? "VERIFIED" : "VERIFICATION INCOMPLETE"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TILES.map((t) => {
          const active = checks[t.key];
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() =>
                setChecks((prev) => ({ ...prev, [t.key]: !prev[t.key] }))
              }
              className={`rounded-xl border p-4 text-left transition-colors ${
                active
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-hairline bg-surface-2 hover:bg-surface"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={active ? "text-emerald-400" : "text-slate-500"}>
                  <Icon />
                </span>
                <span className="text-sm font-semibold text-ink">
                  {t.label}
                </span>
                {active && (
                  <CheckIcon className="ml-auto h-3.5 w-3.5 text-emerald-400" />
                )}
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                {t.desc}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
