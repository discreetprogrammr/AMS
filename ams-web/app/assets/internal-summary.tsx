export type InternalSummary = {
  total: number;
  assigned: number;
  inStock: number;
  needsRepair: number;
  warrantyExpiring: number;
};

// Counts respect the Segment filter only (see page.tsx), so they stay a
// stable overview while the list below is narrowed.
export function InternalSummaryTiles({ summary }: { summary: InternalSummary }) {
  const tiles = [
    { label: "Total", value: summary.total },
    { label: "Assigned", value: summary.assigned },
    { label: "In Stock", value: summary.inStock },
    { label: "Needs Repair", value: summary.needsRepair },
    { label: "Warranty expiring in 60 days", value: summary.warrantyExpiring },
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-hairline bg-surface px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t.label}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{t.value}</p>
        </div>
      ))}
    </div>
  );
}
