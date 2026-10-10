"use client";

import { useRouter } from "next/navigation";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  MISSING_FIELDS,
  NONE,
  SEGMENTS,
  UNASSIGNED,
  WARRANTY_FILTERS,
  internalAssetsHref,
  type InternalFilters,
} from "@/lib/internal-equipment";

type Org = { id: string; name: string; is_internal: boolean };

export type InternalOptions = {
  custodians: string[];
  hasUnassigned: boolean;
  departments: string[];
  categories: string[];
};

const selectClass =
  "h-10 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none";

const labelClass = "flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500";

// Organization / Segment / internal-equipment filters. State lives in the
// URL, so a filtered view can be bookmarked; ?q= and every other active
// filter are carried through a change. Changing the organization drops the
// internal-only filters, which only apply to the internal organization.
export function AssetsFilters({
  organizations,
  orgId,
  filters,
  options,
  q,
  hideOrganization = false,
}: {
  organizations: Org[];
  orgId: string;
  filters: InternalFilters;
  options: InternalOptions | null;
  q: string;
  // HR & Admin preset: locked to the internal organization, no picker.
  hideOrganization?: boolean;
}) {
  const router = useRouter();
  const selected = organizations.find((o) => o.id === orgId);

  function changeOrg(org: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (org) params.set("org", org);
    const qs = params.toString();
    router.push(qs ? `/assets?${qs}` : "/assets");
  }

  function change(next: Partial<InternalFilters>) {
    router.push(internalAssetsHref({ q, org: orgId }, { ...filters, ...next }));
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {!hideOrganization && (
        <label className={labelClass}>
          Organization
          <select
            value={orgId}
            onChange={(e) => changeOrg(e.target.value)}
            className={selectClass}
          >
            <option value="">All organizations</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected?.is_internal && (
        <label className={labelClass}>
          Segment
          <select
            value={filters.segment}
            onChange={(e) => change({ segment: e.target.value })}
            className={selectClass}
          >
            <option value="">All segments</option>
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected?.is_internal && options && (
        <>
          <label className={labelClass}>
            Custodian
            <select
              value={filters.custodian}
              onChange={(e) => change({ custodian: e.target.value })}
              className={selectClass}
            >
              <option value="">All custodians</option>
              {options.hasUnassigned && <option value={UNASSIGNED}>Unassigned</option>}
              {options.custodians.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Department
            <select
              value={filters.department}
              onChange={(e) => change({ department: e.target.value })}
              className={selectClass}
            >
              <option value="">All departments</option>
              <option value={NONE}>Not set</option>
              {options.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Category
            <select
              value={filters.category}
              onChange={(e) => change({ category: e.target.value })}
              className={selectClass}
            >
              <option value="">All categories</option>
              <option value={NONE}>Not set</option>
              {options.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Status
            <select
              value={filters.assignment}
              onChange={(e) => change({ assignment: e.target.value })}
              className={selectClass}
            >
              <option value="">Any status</option>
              {ASSIGNMENT_STATUSES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
              <option value={NONE}>Not set</option>
            </select>
          </label>
          <label className={labelClass}>
            Condition
            <select
              value={filters.condition}
              onChange={(e) => change({ condition: e.target.value })}
              className={selectClass}
            >
              <option value="">Any condition</option>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option value={NONE}>Not set</option>
            </select>
          </label>
          <label className={labelClass}>
            Missing
            <select
              value={filters.missing}
              onChange={(e) => change({ missing: e.target.value })}
              className={selectClass}
            >
              <option value="">Nothing</option>
              {MISSING_FIELDS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Warranty
            <select
              value={filters.warranty}
              onChange={(e) => change({ warranty: e.target.value })}
              className={selectClass}
            >
              <option value="">Any warranty</option>
              {WARRANTY_FILTERS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
