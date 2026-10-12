import { getAnalytics } from "@/lib/analytics";
import { forbidHrAdminPreset } from "@/lib/hr-admin-guard";
import { forbidViewer } from "@/lib/viewer-guard";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Same shared computation as app/analytics/page.tsx, so the exported file
// always matches what's on screen — including RLS scoping (a client's
// session only ever sees their own org's rows, same as everywhere else).
export async function GET() {
  // A read-only viewer account gets no downloads and no writes (lib/viewer-guard.ts).
  const viewerBlocked = await forbidViewer();
  if (viewerBlocked) return viewerBlocked;

  // HR & Admin preset users get nothing from client-facing routes.
  const forbidden = await forbidHrAdminPreset();
  if (forbidden) return forbidden;

  const { months, totals } = await getAnalytics();

  const header = [
    "Month",
    "Uptime %",
    "Assets Tracked",
    "Tickets Opened",
    "Tickets Resolved",
    "Mean Time to Repair (hours)",
  ];

  const rows = months.map((m) => [
    m.label,
    m.uptimePct ?? "",
    m.assetsTracked,
    m.ticketsOpened,
    m.ticketsResolved,
    m.mttrHours !== null ? m.mttrHours.toFixed(1) : "",
  ]);

  rows.push([
    "6-Month Average / Total",
    totals.avgUptimePct ?? "",
    "",
    totals.ticketsOpened,
    totals.ticketsResolved,
    totals.avgMttrHours !== null ? totals.avgMttrHours.toFixed(1) : "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const filename = `trends-analytics-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
