// Short, human-friendly reference derived from a real ticket UUID — not a
// separate stored ticket number, just the first 8 characters of the actual
// id, so it stays consistent with the underlying record.
export function ticketRef(id: string): string {
  return `TKT-${id.slice(0, 8).toUpperCase()}`;
}

// Same derivation approach as ticketRef, for work orders.
export function woRef(id: string): string {
  return `WO-${id.slice(0, 8).toUpperCase()}`;
}

// Same derivation approach, for service reports. Prefix reflects the
// report's kind (lib/report-types.ts's REPORT_KIND_REF_PREFIX) at the call
// site since one function covers all six report kinds.
export function reportRef(id: string, prefix: string): string {
  return `${prefix}-${id.slice(0, 8).toUpperCase()}`;
}

// Site name + serial number instead of the internal asset_tag code (e.g.
// "AST-0004") — a lot more meaningful at a glance for anyone reading a
// list of equipment, especially a client who never sees asset_tag
// anywhere else. Falls back to asset_tag (then a bare dash) if site/serial
// aren't available, so nothing renders blank.
export function assetLabel(asset: {
  asset_tag?: string | null;
  serial_number?: string | null;
  sites?: { address?: string | null } | null;
} | null | undefined): string {
  if (!asset) return "—";
  const site = asset.sites?.address;
  const serial = asset.serial_number;
  if (site && serial) return `${site} — SN ${serial}`;
  if (site) return site;
  if (serial) return `SN ${serial}`;
  return asset.asset_tag ?? "—";
}

// Date AND time (item requested for SLA-relevant timestamps: when a
// ticket/work order was raised, resolved, or closed) — plain
// toLocaleDateString() elsewhere in the app is date-only on purpose for
// less time-sensitive fields (due dates, expiry dates), but these are.
export function dateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
