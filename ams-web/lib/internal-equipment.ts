// Vocabulary and rules for internal equipment (schema_step46.sql, spec
// docs/HorizonCare360_Internal_Equipment_Spec_v0.1.md sections 4.2, 4.3).
// The value lists mirror the CHECK constraints in the database.

export const SEGMENTS = [
  { value: "pacific_horizon_tek", label: "Pacific Horizon Tek" },
  { value: "team_fridays_digital", label: "Team Fridays Digital" },
] as const;

export const OWNERSHIPS = [
  { value: "company_owned", label: "Company-owned" },
  { value: "leased_rented", label: "Leased / Rented" },
  { value: "client_owned", label: "Client-owned" },
  { value: "other", label: "Other" },
] as const;

export const ASSIGNMENT_STATUSES = [
  { value: "assigned", label: "Assigned" },
  { value: "in_stock", label: "In Stock" },
  { value: "returned", label: "Returned" },
  { value: "retired_disposed", label: "Retired / Disposed" },
  { value: "lost", label: "Lost" },
] as const;

export const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "for_repair", label: "For Repair" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
] as const;

type Option = { value: string; label: string };

export function labelFor(options: readonly Option[], value: string | null | undefined): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

/**
 * Finds an option from what a person typed in a spreadsheet: the stored
 * value ("for_repair") or the label ("For Repair"), ignoring case, spacing
 * and punctuation ("retired / disposed" matches Retired / Disposed).
 */
export function matchOption(options: readonly Option[], raw: string | null | undefined): string | null {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const wanted = norm(raw ?? "");
  if (!wanted) return null;
  return options.find((o) => norm(o.value) === wanted || norm(o.label) === wanted)?.value ?? null;
}

/** Escapes % _ and \\ so a person's name can go into an ilike as a plain, case-insensitive match. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

export function isOneOf(options: readonly Option[], value: string | null): value is string {
  return value !== null && options.some((o) => o.value === value);
}

export type AssetStatus = "operational" | "attention" | "down" | "unserviceable";

/**
 * Spec 4.3: assets.status keeps meaning "operating state" for internal
 * items, derived from assignment_status and condition. First match wins.
 */
export function deriveInternalStatus(
  condition: string | null,
  assignmentStatus: string | null,
): AssetStatus {
  if (assignmentStatus === "retired_disposed" || assignmentStatus === "lost") return "unserviceable";
  if (condition === "lost") return "unserviceable";
  if (condition === "for_repair") return "down";
  if (condition === "damaged") return "attention";
  return "operational";
}

// Internal asset tags are PHT-EQ-NNNN (the spreadsheet's Asset No.).
export const INTERNAL_TAG_PREFIX = "PHT-EQ-";
export const INTERNAL_TAG_PATTERN = /^PHT-EQ-\d{4,}$/;

export function formatInternalTag(n: number): string {
  return `${INTERNAL_TAG_PREFIX}${String(n).padStart(4, "0")}`;
}

/** Highest PHT-EQ number among the given tags, plus one. */
export function nextInternalTagFrom(tags: (string | null)[]): string {
  let max = 0;
  for (const tag of tags) {
    const m = /^PHT-EQ-(\d+)$/.exec(tag ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return formatInternalTag(max + 1);
}

// Header row of the internal export (spec 7.4): the spreadsheet's Equipment
// List columns in their order, plus Segment. "Unit" has no database column
// and is exported blank; "Current Location" is the site's address.
export const INTERNAL_EXPORT_HEADER = [
  "Asset No.",
  "Equipment Category",
  "Equipment / Description",
  "Brand",
  "Model",
  "Serial No.",
  "Qty",
  "Unit",
  "Ownership",
  "Date Acquired",
  "Acquisition Cost",
  "Supplier",
  "Current Location",
  "Assigned To / Custodian",
  "Department",
  "Date Issued",
  "Status",
  "Condition",
  "Warranty Expiry",
  "Return / Disposal Date",
  "Remarks",
  "Segment",
] as const;

// ---------------------------------------------------------------------------
// Internal list filters (/assets for the internal organization, and the
// internal CSV export). One parser and one query helper, so the page, the
// summary tiles and the export can never disagree about what a filter means.
// ---------------------------------------------------------------------------

export const VIEWS = [
  { value: "all", label: "All" },
  { value: "assigned", label: "Assigned" },
  { value: "in_stock", label: "In Stock" },
  { value: "repair", label: "Needs Repair" },
  { value: "returned", label: "Returned" },
  { value: "retired", label: "Retired / Lost" },
] as const;

export const WARRANTY_FILTERS = [
  { value: "active", label: "Active" },
  { value: "expiring", label: "Expiring in 60 days" },
  { value: "expired", label: "Expired" },
  { value: "unknown", label: "Unknown" },
] as const;

/** custodian filter value meaning "custodian is empty". */
export const UNASSIGNED = "__unassigned";

export const WARRANTY_WINDOW_DAYS = 60;

/** category / department / condition / assignment filter value meaning "not set". */
export const NONE = "__none";

/** "Missing data" filter values: housekeeping on the equipment dashboard. */
export const MISSING_FIELDS = [
  { value: "acquisition_cost", label: "No acquisition cost" },
  { value: "date_acquired", label: "No date acquired" },
] as const;

/** Not a pill: lets the export route keep its old "everything" default. */
export const EVERY_VIEW = "every";

export type InternalFilters = {
  segment: string;
  view: string; // a VIEWS value; "all" when unset
  custodian: string;
  department: string;
  category: string;
  warranty: string; // a WARRANTY_FILTERS value, or ""
  condition: string; // a CONDITIONS value, NONE, or ""
  assignment: string; // an ASSIGNMENT_STATUSES value, NONE, or ""
  missing: string; // a MISSING_FIELDS value, or ""
};

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function oneOfOrNone(options: readonly Option[], value: string): string {
  return value === NONE || isOneOf(options, value || null) ? value : "";
}

export function parseInternalFilters(params: Params): InternalFilters {
  const segment = one(params, "segment");
  const view = one(params, "view");
  const warranty = one(params, "warranty");
  return {
    segment: isOneOf(SEGMENTS, segment || null) ? segment : "",
    view: isOneOf(VIEWS, view || null) ? view : "all",
    custodian: one(params, "custodian"),
    department: one(params, "department"),
    category: one(params, "category"),
    warranty: isOneOf(WARRANTY_FILTERS, warranty || null) ? warranty : "",
    condition: oneOfOrNone(CONDITIONS, one(params, "condition")),
    assignment: oneOfOrNone(ASSIGNMENT_STATUSES, one(params, "assignment")),
    missing: isOneOf(MISSING_FIELDS, one(params, "missing") || null) ? one(params, "missing") : "",
  };
}

/** Today in Asia/Manila as YYYY-MM-DD, plus an optional day offset. */
export function manilaDate(offsetDays = 0, now: Date = new Date()): string {
  const base = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now) + "T00:00:00Z",
  );
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

// The subset of the Supabase query builder these helpers use. Every method
// returns the same builder; modelling that recursively makes tsc blow its
// instantiation depth on PostgREST's generics, so the methods return `any`
// and each helper is typed Q in, Q out.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Filterable = {
  eq(column: string, value: string): any;
  or(filters: string): any;
  gt(column: string, value: string): any;
  gte(column: string, value: string): any;
  lte(column: string, value: string): any;
  lt(column: string, value: string): any;
  is(column: string, value: null): any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// PostgREST filter strings. Retired / Lost covers assignment_status
// retired_disposed or lost, and condition lost (matching deriveInternalStatus
// above). Both columns are nullable, so "not retired" must keep the nulls.
const RETIRED_OR = "assignment_status.in.(retired_disposed,lost),condition.eq.lost";
const NOT_ASSIGNMENT_RETIRED = "assignment_status.is.null,assignment_status.not.in.(retired_disposed,lost)";
const NOT_CONDITION_LOST = "condition.is.null,condition.neq.lost";

/** Excludes retired / lost rows: the scope of All, Total and Needs Repair. */
export function excludeRetired<Q extends Filterable>(query: Q): Q {
  return query.or(NOT_ASSIGNMENT_RETIRED).or(NOT_CONDITION_LOST);
}

/** Segment only: what the summary tiles respect. */
export function applySegment<Q extends Filterable>(query: Q, f: Pick<InternalFilters, "segment">): Q {
  return f.segment ? query.eq("segment", f.segment) : query;
}

export function applyWarrantyFilter<Q extends Filterable>(query: Q, warranty: string, today = manilaDate()): Q {
  const limit = manilaDate(WARRANTY_WINDOW_DAYS, new Date(today + "T00:00:00Z"));
  switch (warranty) {
    case "active": // more than 60 days away
      return query.gt("warranty_end_date", limit);
    case "expiring": // today through today + 60
      return query.gte("warranty_end_date", today).lte("warranty_end_date", limit);
    case "expired":
      return query.lt("warranty_end_date", today);
    case "unknown":
      return query.is("warranty_end_date", null);
    default:
      return query;
  }
}

/** Everything except the free-text search, which the caller owns. */
export function applyInternalFilters<Q extends Filterable>(query: Q, f: InternalFilters, today = manilaDate()): Q {
  let q = applySegment(query, f);
  switch (f.view) {
    case "assigned":
      q = excludeRetired(q).eq("assignment_status", "assigned");
      break;
    case "in_stock":
      q = excludeRetired(q).eq("assignment_status", "in_stock");
      break;
    case "returned":
      q = excludeRetired(q).eq("assignment_status", "returned");
      break;
    case "repair":
      q = excludeRetired(q).or("condition.in.(for_repair,damaged)");
      break;
    case "retired":
      q = q.or(RETIRED_OR);
      break;
    case EVERY_VIEW: // no view restriction at all (bare export URL)
      break;
    default:
      q = excludeRetired(q);
  }
  if (f.custodian === UNASSIGNED) q = q.or("custodian.is.null,custodian.eq.");
  else if (f.custodian) q = q.eq("custodian", f.custodian);
  if (f.department === NONE) q = q.or("department.is.null,department.eq.");
  else if (f.department) q = q.eq("department", f.department);
  if (f.category === NONE) q = q.or("asset_category.is.null,asset_category.eq.");
  else if (f.category) q = q.eq("asset_category", f.category);
  if (f.condition === NONE) q = q.is("condition", null);
  else if (f.condition) q = q.eq("condition", f.condition);
  if (f.assignment === NONE) q = q.is("assignment_status", null);
  else if (f.assignment) q = q.eq("assignment_status", f.assignment);
  if (f.missing) q = q.is(f.missing, null);
  return applyWarrantyFilter(q, f.warranty, today);
}

/** /assets URL for the internal view: only non-default values are written. */
export function internalAssetsHref(
  base: { q?: string; org: string },
  f: Partial<InternalFilters>,
): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  params.set("org", base.org);
  if (f.segment) params.set("segment", f.segment);
  if (f.view && f.view !== "all") params.set("view", f.view);
  if (f.custodian) params.set("custodian", f.custodian);
  if (f.department) params.set("department", f.department);
  if (f.category) params.set("category", f.category);
  if (f.warranty) params.set("warranty", f.warranty);
  if (f.condition) params.set("condition", f.condition);
  if (f.assignment) params.set("assignment", f.assignment);
  if (f.missing) params.set("missing", f.missing);
  return `/assets?${params.toString()}`;
}

/**
 * Retired / lost: the rows excludeRetired() leaves out of All, Total and
 * every pill but "Retired / Lost". The same rule as RETIRED_OR above, for
 * code that has the rows in hand (the equipment dashboard).
 */
export function isRetiredRow(row: { assignment_status: string | null; condition: string | null }): boolean {
  return (
    row.assignment_status === "retired_disposed" ||
    row.assignment_status === "lost" ||
    row.condition === "lost"
  );
}
