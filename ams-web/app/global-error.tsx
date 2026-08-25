"use client";

import { useEffect } from "react";

// Error Monitoring (schema_step43.sql) — Next.js's root error boundary.
// Catches anything an uncaught error/exception in a Server or Client
// Component that no closer error.tsx already handled — the last line of
// defense before a user just sees a blank white screen with no record of
// what happened. Reports the crash to app/api/log-client-error/route.ts
// (this is a Client Component and can't call the service-role client
// directly), then shows a minimal recovery screen.
//
// A root error boundary replaces the ENTIRE app, including the root
// layout — it must render its own <html>/<body> (App Router requirement)
// and can't safely assume globals.css/Tailwind's CSS custom properties are
// still available, so this uses plain inline styles rather than the
// app's usual className conventions.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack ?? null,
        digest: error.digest ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
      }),
    }).catch(() => {
      // Best-effort — if even the logging request fails (offline, etc.)
      // there's nothing more useful to do than let the fallback UI show.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#05070D",
          color: "#e2e8f0",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <p
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#64748b",
              margin: "0 0 8px",
            }}
          >
            HorizonCare360
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.5, margin: "0 0 20px" }}>
            This has been reported automatically. You can try again, or head back to the
            dashboard.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                border: "none",
                borderRadius: 8,
                background: "#2563eb",
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                padding: "10px 18px",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/dashboard"
              style={{
                border: "1px solid #334155",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: 14,
                fontWeight: 500,
                padding: "10px 18px",
                textDecoration: "none",
              }}
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
