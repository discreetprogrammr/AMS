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

// Same derivation approach, for service reports (PM/CM). Prefix reflects
// service_records.service_type at the call site since one function covers
// both report kinds.
export function reportRef(id: string, prefix: "PM" | "CM"): string {
  return `${prefix}-${id.slice(0, 8).toUpperCase()}`;
}
