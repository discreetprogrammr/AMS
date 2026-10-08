"use client";

import { useRouter } from "next/navigation";
import { SEGMENTS } from "@/lib/internal-equipment";

type Org = { id: string; name: string; is_internal: boolean };

const selectClass =
  "h-10 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none";

// Organization / Segment filters. State lives in the URL (?org=&segment=),
// so a filtered view can be bookmarked; ?q= is carried through. Changing
// the organization drops the segment, which only applies to internal ones.
export function AssetsFilters({
  organizations,
  orgId,
  segment,
  q,
}: {
  organizations: Org[];
  orgId: string;
  segment: string;
  q: string;
}) {
  const router = useRouter();
  const selected = organizations.find((o) => o.id === orgId);

  function go(next: { org?: string; segment?: string }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next.org) params.set("org", next.org);
    if (next.org && next.segment) params.set("segment", next.segment);
    const qs = params.toString();
    router.push(qs ? `/assets?${qs}` : "/assets");
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
        Organization
        <select
          value={orgId}
          onChange={(e) => go({ org: e.target.value })}
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
      {selected?.is_internal && (
        <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
          Segment
          <select
            value={segment}
            onChange={(e) => go({ org: orgId, segment: e.target.value })}
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
    </div>
  );
}
