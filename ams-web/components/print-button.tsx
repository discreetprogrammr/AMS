"use client";

// Triggers the browser's native print dialog, which on every modern
// browser/OS offers "Save as PDF" as a destination — this is the actual
// PDF export mechanism for service reports (see the note in
// app/reports/service-record/[id]/page.tsx for why: no PDF-generation
// library is installable in this environment, and this approach needs
// none — it renders the exact same report data through real CSS instead
// of an external PDF engine, so it can never drift out of sync with what's
// on screen).
export function PrintButton({
  label = "Print / Save as PDF",
}: {
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
    >
      {label}
    </button>
  );
}
