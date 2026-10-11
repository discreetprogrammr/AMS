// Warranty expiry buckets for the internal equipment register (Warranty &
// Renewals tab and the weekly reminder email). Dates are plain calendar dates
// (warranty_end_date), compared as Manila "today", so a warranty that ends
// today is still in force today.
import { isRetiredRow } from "@/lib/internal-equipment";

export type WarrantyRow = {
  id: string;
  asset_tag: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  custodian: string | null;
  department: string | null;
  warranty_end_date: string | null;
  assignment_status: string | null;
  condition: string | null;
};

export type WarrantyBucketKey = "expired" | "d30" | "d60" | "d90";

export const WARRANTY_BUCKETS: { key: WarrantyBucketKey; label: string }[] = [
  { key: "expired", label: "Expired" },
  { key: "d30", label: "Within 30 days" },
  { key: "d60", label: "31 to 60 days" },
  { key: "d90", label: "61 to 90 days" },
];

export type WarrantyItem = WarrantyRow & { daysLeft: number };

export type WarrantyBuckets = Record<WarrantyBucketKey, WarrantyItem[]> & {
  later: number; // in force for more than 90 days more
  unknown: number; // no warranty date recorded
};

const DAY_MS = 86_400_000;

/** Whole days from `today` to `date` (both YYYY-MM-DD); negative once past. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / DAY_MS);
}

/** Active items only (retired / lost left out), each in exactly one bucket, soonest first. */
export function bucketWarranties(rows: WarrantyRow[], today: string): WarrantyBuckets {
  const out: WarrantyBuckets = { expired: [], d30: [], d60: [], d90: [], later: 0, unknown: 0 };
  for (const r of rows) {
    if (isRetiredRow(r)) continue;
    if (!r.warranty_end_date) {
      out.unknown++;
      continue;
    }
    const daysLeft = daysUntil(r.warranty_end_date, today);
    const item = { ...r, daysLeft };
    if (daysLeft < 0) out.expired.push(item);
    else if (daysLeft <= 30) out.d30.push(item);
    else if (daysLeft <= 60) out.d60.push(item);
    else if (daysLeft <= 90) out.d90.push(item);
    else out.later++;
  }
  // Expired: most recently lapsed first; the rest: soonest first.
  out.expired.sort((a, b) => b.daysLeft - a.daysLeft);
  for (const k of ["d30", "d60", "d90"] as const) out[k].sort((a, b) => a.daysLeft - b.daysLeft);
  return out;
}

export function daysLabel(daysLeft: number): string {
  if (daysLeft === 0) return "ends today";
  if (daysLeft > 0) return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  const past = -daysLeft;
  return `expired ${past} day${past === 1 ? "" : "s"} ago`;
}
