"use client";

// Customer Satisfaction Rating card, matching the reference's CSAT block
// on the PM checklist (service / machine / support / overall, 1–5 each).
// Self-contained like SignaturePad: each question keeps its own rating in
// local state and writes it to a hidden input, so it drops straight into
// any <form> without the parent needing to track four extra state values.
import { useState } from "react";

const QUESTIONS: { name: string; label: string }[] = [
  { name: "csat_service", label: "How is the service done?" },
  { name: "csat_machine", label: "How is the experience in the machine / unit?" },
  { name: "csat_support", label: "How is the support you received?" },
  { name: "csat_overall", label: "Overall satisfaction with Pacific Horizon Tek?" },
];

function RatingRow({ name, label }: { name: string; label: string }) {
  const [value, setValue] = useState(0);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2">
      <input type="hidden" name={name} value={value || ""} />
      <div className="text-sm text-ink-soft">{label}</div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setValue(n)}
            className={`h-8 w-8 rounded-full text-xs font-semibold ${
              value >= n
                ? "bg-blue-600 text-ink"
                : "border border-hairline bg-surface-2 text-ink-soft hover:bg-surface"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CustomerSurvey() {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-6">
      <div>
        <h3 className="text-sm font-semibold text-ink">
          Customer Satisfaction Rating
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          1 = unsatisfied · 5 = very satisfied
        </p>
      </div>
      <div className="mt-3 divide-y divide-hairline">
        {QUESTIONS.map((q) => (
          <RatingRow key={q.name} name={q.name} label={q.label} />
        ))}
      </div>
    </div>
  );
}
