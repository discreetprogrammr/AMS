// Single source of truth for the six report "kinds" the Reports tab
// organizes around (schema_step41.sql). Before this, the PM-vs-CM split
// was a `PM_TYPES` array duplicated independently in app/reports/page.tsx
// and the CSV export route — a real risk of drifting apart any time a
// type was added, which is exactly what was about to happen again with
// four new types. Every place that needs to group/label/order records by
// type should import from here instead of re-declaring its own list.
export type ReportKind =
  | "pm"
  | "cm"
  | "installation"
  | "radiation_survey"
  | "site_survey"
  | "training";

// Maps every service_records.service_type value onto one of the six kinds.
// calibration/water_quality_test still fold into the general PM bucket —
// same as before this change, neither was ever given its own dedicated
// form, so there's nothing to split out yet.
export function reportKindOf(serviceType: string): ReportKind {
  switch (serviceType) {
    case "repair":
      return "cm";
    case "installation":
      return "installation";
    case "radiation_survey":
      return "radiation_survey";
    case "site_survey":
      return "site_survey";
    case "training":
      return "training";
    default:
      return "pm";
  }
}

export const REPORT_KIND_ORDER: ReportKind[] = [
  "pm",
  "cm",
  "installation",
  "radiation_survey",
  "site_survey",
  "training",
];

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  pm: "Preventive Maintenance",
  cm: "Corrective Maintenance",
  installation: "Installation",
  radiation_survey: "Radiation Survey Test",
  site_survey: "Site Survey",
  training: "Training",
};

// Short reference-number prefixes (lib/format.ts's reportRef()) and the
// bold report title printed on the PDF/HTML view (lib/pdf/service-report.ts,
// app/reports/service-record/[id]/page.tsx) — kept alongside the labels
// above since they're the same kind of per-kind lookup table.
export const REPORT_KIND_REF_PREFIX: Record<ReportKind, string> = {
  pm: "PM",
  cm: "CM",
  installation: "INST",
  radiation_survey: "RAD",
  site_survey: "SITE",
  training: "TRN",
};

export const REPORT_KIND_TITLES: Record<ReportKind, string> = {
  pm: "Preventive Maintenance Report",
  cm: "Corrective Maintenance Report",
  installation: "Installation Report",
  radiation_survey: "Radiation Survey Test Report",
  site_survey: "Site Survey Report",
  training: "Training Report",
};
