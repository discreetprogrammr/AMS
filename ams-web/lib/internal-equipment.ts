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
