// Shared SLA targets and helpers — single source of truth for both the
// SLA Performance dashboard widgets (app/dashboard/page.tsx) and the SLA
// breach escalation job (lib/sla-escalation.ts). Previously these constants
// only lived in the dashboard; pulling them out here means the escalation
// job can never silently drift from what the dashboard displays as
// "compliant."
//
// Not a contractual figure yet — just the working target we're building
// against until a real client SLA is signed.
export const SLA_RESPONSE_TARGET_HOURS = 8;
export const SLA_RESOLUTION_TARGET_HOURS = 48;

export function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}
