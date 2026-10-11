// The Reports tab's equipment register report: every internal item that
// matches the filters, optionally grouped (by department, category, custodian
// or segment) with a count and total acquisition cost per group. It uses the
// same filter rules as the Assets list (applyInternalFilters), so a report and
// the list agree. Assemblies (lib/assemblies.ts) are left out so the counts
// and the cost total match HR's spreadsheet.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInternalOrgIds } from "@/lib/internal-org";
import { loadAssemblyIds, withoutAssemblies } from "@/lib/assemblies";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  EVERY_VIEW,
  NONE,
  SEGMENTS,
  VIEWS,
  applyInternalFilters,
  labelFor,
  manilaDate,
  parseInternalFilters,
  type InternalFilters,
} from "@/lib/internal-equipment";

export type GroupKey = "none" | "department" | "category" | "custodian" | "segment";
export const GROUPS: { value: GroupKey; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "department", label: "Department" },
  { value: "category", label: "Category" },
  { value: "custodian", label: "Custodian" },
  { value: "segment", label: "Segment" },
];

// Status choices on the report: the Assets list's pills, plus "Everything"
// (retired and lost included).
export const REPORT_STATUSES = [...VIEWS.map((v) => ({ value: v.value as string, label: v.label === "All" ? "Active items" : v.label })), { value: EVERY_VIEW, label: "Everything" }];

export type ReportRow = {
  id: string;
  asset_tag: string;
  asset_category: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  quantity: number | null;
  unit: string | null;
  segment: string | null;
  custodian: string | null;
  department: string | null;
  assignment_status: string | null;
  condition: string | null;
  date_acquired: string | null;
  acquisition_cost: number | string | null;
  warranty_end_date: string | null;
};

export type ReportGroup = { label: string; rows: ReportRow[]; cost: number };
export type EquipmentReport = {
  groups: ReportGroup[];
  items: number;
  cost: number;
  filters: InternalFilters;
  statusParam: string;
  group: GroupKey;
  description: string;
  error: string | null;
};

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export function parseReportParams(params: Params): { filters: InternalFilters; statusParam: string; group: GroupKey } {
  const statusParam = first(params.status);
  const filters = parseInternalFilters({
    segment: first(params.segment),
    department: first(params.department),
    category: first(params.category),
    view: statusParam,
  });
  // "Everything" is not one of the list's pills: no retired / lost restriction at all.
  if (statusParam === EVERY_VIEW) filters.view = EVERY_VIEW;
  const g = first(params.group);
  const group = GROUPS.some((x) => x.value === g) ? (g as GroupKey) : "none";
  return { filters, statusParam: filters.view, group };
}

export const cost = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const formatMoney = (n: number) => money.format(n);

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function groupLabel(r: ReportRow, key: GroupKey): string {
  switch (key) {
    case "department":
      return r.department?.trim() || "Not set";
    case "category":
      return r.asset_category?.trim() || "Not set";
    case "custodian":
      return r.custodian?.trim() || "No custodian";
    case "segment":
      return r.segment ? labelFor(SEGMENTS, r.segment) : "Not set";
    default:
      return "";
  }
}

export function groupRows(rows: ReportRow[], key: GroupKey): ReportGroup[] {
  const sorted = [...rows].sort((a, b) => collator.compare(a.asset_tag, b.asset_tag));
  if (key === "none") return [{ label: "", rows: sorted, cost: sorted.reduce((n, r) => n + cost(r.acquisition_cost), 0) }];
  const map = new Map<string, ReportRow[]>();
  for (const r of sorted) {
    const label = groupLabel(r, key);
    map.set(label, [...(map.get(label) ?? []), r]);
  }
  return Array.from(map, ([label, rs]) => ({ label, rows: rs, cost: rs.reduce((n, r) => n + cost(r.acquisition_cost), 0) })).sort(
    (a, b) => {
      const empty = (l: string) => l === "Not set" || l === "No custodian";
      if (empty(a.label) !== empty(b.label)) return empty(a.label) ? 1 : -1; // "not set" last
      return collator.compare(a.label, b.label);
    },
  );
}

/** A line saying what the report covers, for the page and the printout. */
export function describeReport(filters: InternalFilters, group: GroupKey): string {
  const parts: string[] = [];
  if (filters.segment) parts.push(`Segment: ${labelFor(SEGMENTS, filters.segment)}`);
  if (filters.department) parts.push(`Department: ${filters.department === NONE ? "not set" : filters.department}`);
  if (filters.category) parts.push(`Category: ${filters.category === NONE ? "not set" : filters.category}`);
  parts.push(`Status: ${REPORT_STATUSES.find((s) => s.value === filters.view)?.label ?? "Active items"}`);
  if (group !== "none") parts.push(`Grouped by ${GROUPS.find((g) => g.value === group)?.label.toLowerCase()}`);
  return parts.join(" · ");
}

export function itemName(r: ReportRow): string {
  return r.description || [r.brand, r.model].filter(Boolean).join(" ") || "—";
}

export function statusText(r: ReportRow): string {
  return [r.assignment_status ? labelFor(ASSIGNMENT_STATUSES, r.assignment_status) : "", r.condition ? labelFor(CONDITIONS, r.condition) : ""]
    .filter(Boolean)
    .join(" / ") || "—";
}

const FIELDS =
  "id, asset_tag, asset_category, description, brand, model, serial_number, quantity, unit, segment, custodian, department, assignment_status, condition, date_acquired, acquisition_cost, warranty_end_date";

/** Loads the report. Internal equipment only, whatever is in the URL. */
export async function loadEquipmentReport(supabase: SupabaseClient, params: Params): Promise<EquipmentReport> {
  const { filters, statusParam, group } = parseReportParams(params);
  const base = { filters, statusParam, group, description: describeReport(filters, group) };
  const orgIds = await getInternalOrgIds(supabase);
  if (orgIds.length === 0) return { ...base, groups: [], items: 0, cost: 0, error: null };

  let query = supabase.from("assets").select(FIELDS).in("organization_id", orgIds);
  query = applyInternalFilters(query, filters, manilaDate());
  const { data, error } = await query;
  if (error) return { ...base, groups: [], items: 0, cost: 0, error: error.message };

  const rows = withoutAssemblies((data ?? []) as ReportRow[], await loadAssemblyIds(supabase, orgIds));
  const groups = groupRows(rows, group);
  return { ...base, groups, items: rows.length, cost: rows.reduce((n, r) => n + cost(r.acquisition_cost), 0), error: null };
}
