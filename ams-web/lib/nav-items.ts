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
  // "Dashboard" and "User Access" are both intentionally absent from this
  // list — see ALWAYS_ACCESSIBLE_HREFS below for why.
];

// hidden_modules (schema_step44.sql) is enforced as a real block now, not
// just a cosmetic sidebar hide (lib/supabase/middleware.ts redirects any
// blocked request to /dashboard) — which makes these two hrefs load-
// bearing rather than just a nice-to-have: /dashboard is the middleware's
// own redirect target (hiding it would cause a redirect loop the moment
// someone hit ANY blocked page), and /user-access is the only page that
// can undo any of this (hiding it from a Super Admin would strand them
// with no in-app recovery path). Neither is ever offered as a checkbox in
// app/user-access (they're excluded from NAV_MODULES entirely, so
// modulesForRole() never returns them), and both are hard-exempted in
// components/sidebar.tsx's filter and lib/supabase/middleware.ts's block
// check regardless of what's actually stored in hidden_modules — belt and
// suspenders against a stale/manually-edited row somehow containing them.
export const ALWAYS_ACCESSIBLE_HREFS = ["/dashboard", "/user-access"];

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
