const TONE_CLASSES = {
  green: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  orange: "bg-orange-500/15 text-orange-400",
  red: "bg-red-500/15 text-red-400",
  blue: "bg-blue-500/15 text-blue-400",
  slate: "bg-slate-500/15 text-ink-soft",
} as const;

type Tone = keyof typeof TONE_CLASSES;

// Central place mapping every status/priority value used across the app to
// a label + color tone, so a given word (e.g. "open") always looks the same
// wherever it shows up.
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Asset status (assets.status, widened in schema_step15.sql). "attention"
  // below (shared with ticket/checklist severity) already covers the
  // renamed former "under_maintenance" value — no separate entry needed.
  operational: { label: "Operational", tone: "green" },
  down: { label: "Down", tone: "orange" },
  unserviceable: { label: "Unserviceable", tone: "red" },
  open: { label: "Open", tone: "blue" },
  in_progress: { label: "In Progress", tone: "amber" },
  // ticket_status and work_order_status share this vocabulary as of
  // schema_step21.sql: Open / In Progress / Parts Pending / Closed.
  parts_pending: { label: "Parts Pending", tone: "orange" },
  closed: { label: "Closed", tone: "green" },
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "amber" },
  high: { label: "High", tone: "red" },
  pass: { label: "Pass", tone: "green" },
  fail: { label: "Fail", tone: "red" },
  pending: { label: "Pending", tone: "slate" },
  // Still used by calendar_events.status and inventory_cycles.status, which
  // schema_step21.sql does NOT touch — only ticket_status/work_order_status
  // were renamed to "closed". Kept separate on purpose.
  completed: { label: "Completed", tone: "green" },
  pacific_horizon_tek: { label: "Pacific Horizon Tek", tone: "blue" },
  third_party: { label: "Third-Party", tone: "slate" },
  critical: { label: "Critical", tone: "red" },
  caution: { label: "Caution", tone: "amber" },
  info: { label: "Info", tone: "blue" },
  draft: { label: "Draft", tone: "slate" },
  submitted: { label: "Submitted", tone: "green" },
  attention: { label: "Attention", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "blue" },
  overdue: { label: "Overdue", tone: "red" },
  // Parts stock (schema_step31.sql) — derived client-side from
  // quantity_on_hand vs reorder_level, not a stored enum value, but
  // StatusBadge just needs a matching key either way.
  in_stock: { label: "In Stock", tone: "green" },
  low_stock: { label: "Low Stock", tone: "amber" },
  out_of_stock: { label: "Out of Stock", tone: "red" },
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
