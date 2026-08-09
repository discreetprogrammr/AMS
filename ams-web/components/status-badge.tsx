const TONE_CLASSES = {
  green: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
  blue: "bg-blue-500/15 text-blue-400",
  slate: "bg-slate-500/15 text-ink-soft",
} as const;

type Tone = keyof typeof TONE_CLASSES;

// Central place mapping every status/priority value used across the app to
// a label + color tone, so a given word (e.g. "open") always looks the same
// wherever it shows up.
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  operational: { label: "Operational", tone: "green" },
  under_maintenance: { label: "Under Maintenance", tone: "amber" },
  unserviceable: { label: "Unserviceable", tone: "red" },
  open: { label: "Open", tone: "blue" },
  in_progress: { label: "In Progress", tone: "amber" },
  resolved: { label: "Resolved", tone: "green" },
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "amber" },
  high: { label: "High", tone: "red" },
  pass: { label: "Pass", tone: "green" },
  fail: { label: "Fail", tone: "red" },
  pending: { label: "Pending", tone: "slate" },
  completed: { label: "Completed", tone: "green" },
  pacific_horizon_tek: { label: "Pacific Horizon Tek", tone: "blue" },
  third_party: { label: "Third-Party", tone: "slate" },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? {
    label: status.replace(/_/g, " "),
    tone: "slate" as Tone,
  };

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${TONE_CLASSES[entry.tone]}`}
    >
      {entry.label}
    </span>
  );
}
