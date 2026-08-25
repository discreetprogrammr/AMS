// Single source of truth for the app's sidebar modules — href, label, and
// which roles can see them at all. Split out of components/sidebar.tsx
// (which still owns the actual icons/JSX) so this same list can be reused
// by app/user-access (Step 44's per-user module visibility) to build its
// checkbox grid without a second, independently-maintained array drifting
// out of sync — same reasoning as lib/report-types.ts's REPORT_KIND_*
// constants replacing a duplicated PM_TYPES array.
//
// href is the stable identity used everywhere (React keys, "active" nav
// highlighting, and now hidden_modules entries) — NOT label, since labels
// have already been renamed once (the Asset Verification/Inventory swap,
// see components/sidebar.tsx's comment) and a rename should never silently
// invalidate someone's saved permissions.
export type NavModule = {
  href: string;
  label: string;
  staffOnly?: boolean;
  superAdminOnly?: boolean;
};

export const NAV_MODULES: NavModule[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/assets", label: "Assets" },
  { href: "/assets/scan", label: "Scan Asset", staffOnly: true },
  { href: "/fleet-map", label: "Fleet Map" },
  { href: "/clients", label: "Clients", staffOnly: true },
  { href: "/work-orders", label: "Work Orders", staffOnly: true },
  { href: "/tickets", label: "Tickets" },
  { href: "/inspections", label: "Inspections", staffOnly: true },
  { href: "/inventory", label: "Asset Verification", staffOnly: true },
  { href: "/parts", label: "Inventory", staffOnly: true },
  { href: "/messages", label: "HorizonCare360 Assist" },
  { href: "/calendar", label: "Calendar" },
  { href: "/reports", label: "Reports" },
  { href: "/analytics", label: "Analytics" },
  { href: "/alerts", label: "Alerts", staffOnly: true },
  { href: "/sla-settings", label: "SLA Policy", staffOnly: true },
  { href: "/audit-log", label: "Audit Log", staffOnly: true, superAdminOnly: true },
  { href: "/error-logs", label: "Error Logs", staffOnly: true, superAdminOnly: true },
  // "User Access" itself is intentionally absent from this list — it's
  // added directly in sidebar.tsx's buildNav(), always superAdminOnly and
  // never itself hideable via hidden_modules (see app/user-access's own
  // comments for why: the one Super Admin locking themselves out of the
  // one page that grants access back would have no in-app recovery path).
];

// Which modules a user of a given role is even ELIGIBLE to see, before
// hidden_modules is applied at all — mirrors components/sidebar.tsx's own
// filter logic exactly (superAdminOnly wins over staffOnly). Used by
// app/user-access to only offer checkboxes for modules that role could
// ever see, instead of showing a meaningless toggle for e.g. "SLA Policy"
// on a client account that's staffOnly-blocked regardless.
export function modulesForRole(isStaff: boolean, isSuperAdmin: boolean): NavModule[] {
  return NAV_MODULES.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (item.staffOnly) return isStaff;
    return true;
  });
}
