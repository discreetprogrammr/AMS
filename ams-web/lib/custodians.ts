// People and the internal equipment they hold (the Custodians tab). Names are
// typed by hand on each item, so "Lourence", "lourence " and "LOURENCE" are
// one person here: grouped by trimmed, lower-cased name, shown with the most
// common spelling.
import { isRetiredRow } from "@/lib/internal-equipment";

export type CustodyRow = {
  id: string;
  asset_tag: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  asset_category: string | null;
  serial_number: string | null;
  department: string | null;
  segment: string | null;
  condition: string | null;
  assignment_status: string | null;
  date_issued: string | null;
  custodian: string | null;
};

export type CustodianSummary = {
  key: string;
  name: string; // most common spelling
  items: number;
  departments: string[];
  segments: string[];
  needsRepair: number;
};

// On a tie, prefer "Lourence" over "lourence" or "LOURENCE".
const plainCase = (v: string) => (v !== v.toLowerCase() && v !== v.toUpperCase() ? 0 : 1);

export const custodianKey = (name: string | null | undefined) => (name ?? "").trim().toLowerCase();

/** Active items that have a custodian, grouped by person. Retired / lost items are left out. */
export function summariseCustodians(rows: CustodyRow[]): CustodianSummary[] {
  const groups = new Map<string, { spellings: Map<string, number>; rows: CustodyRow[] }>();
  for (const r of rows) {
    if (isRetiredRow(r)) continue;
    const key = custodianKey(r.custodian);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Map<string, number>(), rows: [] as CustodyRow[] };
    const spelling = (r.custodian ?? "").trim();
    g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
    g.rows.push(r);
    groups.set(key, g);
  }
  return Array.from(groups, ([key, g]) => ({
    key,
    name: Array.from(g.spellings).sort((a, b) => b[1] - a[1] || plainCase(a[0]) - plainCase(b[0]) || a[0].localeCompare(b[0]))[0][0],
    items: g.rows.length,
    departments: Array.from(new Set(g.rows.map((r) => r.department?.trim()).filter((d): d is string => !!d))).sort(),
    segments: Array.from(new Set(g.rows.map((r) => r.segment).filter((s): s is string => !!s))).sort(),
    needsRepair: g.rows.filter(
      (r) => r.condition === "for_repair" || r.condition === "damaged" || r.assignment_status === "for_repair",
    ).length,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// Optional details per person (schema_step51.sql), matched to items by name.
export type CustodianProfile = {
  name_key: string;
  name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  employee_no: string | null;
  status: "active" | "left";
  notes: string | null;
};

export const CUSTODIAN_STATUSES = [
  { value: "active", label: "Active" },
  { value: "left", label: "Left the company" },
] as const;
