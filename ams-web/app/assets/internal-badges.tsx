import { ASSIGNMENT_STATUSES, CONDITIONS, labelFor } from "@/lib/internal-equipment";

// Same pill styling as components/status-badge.tsx (400 shade on a
// translucent background, semantic tokens only). Kept here rather than in
// the shared STATUS_MAP, whose keys (good, new, lost...) are generic words.
const TONE = {
  green: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  orange: "bg-orange-500/15 text-orange-400",
  red: "bg-red-500/15 text-red-400",
  blue: "bg-blue-500/15 text-blue-400",
  slate: "bg-slate-500/15 text-ink-soft",
} as const;

type Tone = keyof typeof TONE;

const ASSIGNMENT_TONE: Record<string, Tone> = {
  assigned: "blue",
  in_stock: "green",
  for_repair: "orange",
  returned: "slate",
  retired_disposed: "slate",
  lost: "red",
};

const CONDITION_TONE: Record<string, Tone> = {
  new: "blue",
  good: "green",
  fair: "slate",
  for_repair: "orange",
  damaged: "red",
  lost: "red",
};

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Assignment status + Condition, as two badges. assets.status is not shown. */
export function InternalStatusBadges({
  assignmentStatus,
  condition,
}: {
  assignmentStatus: string | null;
  condition: string | null;
}) {
  if (!assignmentStatus && !condition) return <span className="text-ink-soft">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {assignmentStatus && (
        <Pill tone={ASSIGNMENT_TONE[assignmentStatus] ?? "slate"}>
          {labelFor(ASSIGNMENT_STATUSES, assignmentStatus)}
        </Pill>
      )}
      {condition && (
        <Pill tone={CONDITION_TONE[condition] ?? "slate"}>{labelFor(CONDITIONS, condition)}</Pill>
      )}
    </div>
  );
}
