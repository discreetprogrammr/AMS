// Column sorting for the internal equipment list. The list is loaded in full,
// so sorting is done in the browser: instant, and it respects whatever the
// filters have already narrowed it to. Click a header: ascending, click again:
// descending, a third click: back to the default order (newest first).
import { ASSIGNMENT_STATUSES, CONDITIONS, SEGMENTS, labelFor } from "@/lib/internal-equipment";

export type SortKey = "tag" | "item" | "category" | "custodian" | "segment" | "status" | "warranty";
export type SortDir = "asc" | "desc";
export type SortState = { key: SortKey; dir: SortDir } | null;

export const SORT_KEYS: SortKey[] = ["tag", "item", "category", "custodian", "segment", "status", "warranty"];

type SortableRow = {
  asset_tag: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  asset_category: string | null;
  custodian: string | null;
  segment: string | null;
  assignment_status: string | null;
  condition: string | null;
  warranty_end_date: string | null;
};

/** What a row is ordered by for a column; null = empty, which sorts last in either direction. */
function sortValue(r: SortableRow, key: SortKey): string | null {
  const text = (v: string | null | undefined) => (v && v.trim() ? v.trim().toLowerCase() : null);
  switch (key) {
    case "tag":
      return r.asset_tag;
    case "item":
      return text(r.description || [r.brand, r.model].filter(Boolean).join(" "));
    case "category":
      return text(r.asset_category);
    case "custodian":
      return text(r.custodian);
    case "segment":
      return r.segment ? labelFor(SEGMENTS, r.segment).toLowerCase() : null;
    case "status":
      return r.assignment_status || r.condition
        ? `${r.assignment_status ? labelFor(ASSIGNMENT_STATUSES, r.assignment_status) : "~"}|${r.condition ? labelFor(CONDITIONS, r.condition) : "~"}`.toLowerCase()
        : null;
    case "warranty":
      return r.warranty_end_date;
  }
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function sortRows<T extends SortableRow>(rows: T[], sort: SortState): T[] {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null && vb === null) return collator.compare(a.asset_tag, b.asset_tag);
    if (va === null) return 1; // empty last, whichever way it is sorted
    if (vb === null) return -1;
    const c = collator.compare(va, vb);
    // Ties fall back to the asset tag, ascending, so the order is stable.
    return c !== 0 ? c * sign : collator.compare(a.asset_tag, b.asset_tag);
  });
}

/** The state after clicking a column header: asc, then desc, then none. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

export function parseSort(sort: string | null, dir: string | null): SortState {
  return SORT_KEYS.includes(sort as SortKey) && (dir === "asc" || dir === "desc")
    ? { key: sort as SortKey, dir }
    : null;
}
