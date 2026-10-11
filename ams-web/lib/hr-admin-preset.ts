import { NAV_MODULES } from "@/lib/nav-items";

// "HR & Admin (internal equipment)" preset. A user with this preset sees two
// sidebar items, Dashboard (their own internal-equipment dashboard) and
// Assets, and can act on PHtek's internal equipment only.
//
// How a preset user is identified: a marker string stored in
// profiles.hidden_modules next to the hidden hrefs (no schema change). Not
// an exact match of the hidden list: that would stop matching the moment a
// module is added to NAV_MODULES or someone ticks one box. The marker is
// not a NAV_MODULES href, so nothing else treats it as a module. It is set
// only by applyHrAdminPreset() and removed by clearing the user's access.
//
// This file has no server-only imports: lib/supabase/middleware.ts and the
// client sidebar both use it.
export const HR_ADMIN_PRESET_MARKER = "preset:hr_admin";

// Where preset users land: replaces /dashboard for them.
export const EQUIPMENT_DASHBOARD_HREF = "/equipment-dashboard";

// Extra permissions a Super Admin can switch on for one preset user, stored
// the same way as the preset marker (in hidden_modules, no schema change).
// Off by default. Activity is the audit trail of the register, so it is given
// to named people rather than to every HR & Admin user.
export const HR_ADMIN_ACTIVITY_MARKER = "perm:activity";

// The sidebar of a preset user: Dashboard and Assets, then these. Each href
// must also open for them (ALLOWED_PREFIXES below), and each page checks its
// own access. components/sidebar.tsx owns the icons.
export const HR_ADMIN_NAV: { href: string; label: string; requires?: string }[] = [
  { href: "/custodians", label: "Custodians" },
  { href: "/assets/stocktake", label: "Stocktake" },
  { href: "/warranty", label: "Warranty & Renewals" },
  { href: "/equipment-reports", label: "Reports" },
  { href: "/activity", label: "Activity", requires: HR_ADMIN_ACTIVITY_MARKER },
];

export function isHrAdminPreset(hiddenModules: string[] | null | undefined): boolean {
  return (hiddenModules ?? []).includes(HR_ADMIN_PRESET_MARKER);
}

/** May this user see the Activity tab and the change history? Super Admin always; a preset user only with the permission. */
export function canViewActivity(role: string | null | undefined, hiddenModules: string[] | null | undefined): boolean {
  if (role === "super_admin") return true;
  return isHrAdminPreset(hiddenModules) && (hiddenModules ?? []).includes(HR_ADMIN_ACTIVITY_MARKER);
}

/** What the preset stores: every module except Assets hidden, plus the marker. */
export function hrAdminHiddenModules(): string[] {
  return [...NAV_MODULES.map((m) => m.href).filter((href) => href !== "/assets"), HR_ADMIN_PRESET_MARKER];
}

// Default-deny for pages: a preset user may open only these prefixes. A
// module added to the app later is blocked for them without anyone having
// to remember to hide it. /profile is the account page; /login is signing
// out and in.
const ALLOWED_PREFIXES = ["/assets", EQUIPMENT_DASHBOARD_HREF, "/custodians", "/warranty", "/equipment-reports", "/activity", "/profile", "/login"];
// Under /assets but client-only: the CSV importer and the QR scanner.
const DENIED_PREFIXES = ["/assets/import", "/assets/scan"];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function hrAdminMayVisit(pathname: string, hiddenModules?: string[] | null): boolean {
  if (DENIED_PREFIXES.some((p) => under(pathname, p))) return false;
  // Tabs that need an extra permission (see HR_ADMIN_NAV.requires).
  for (const tab of HR_ADMIN_NAV) {
    if (tab.requires && under(pathname, tab.href) && !(hiddenModules ?? []).includes(tab.requires)) return false;
  }
  return ALLOWED_PREFIXES.some((p) => under(pathname, p));
}

/** Paths the middleware needs no profile lookup for (always allowed to everyone). */
export function skipsPresetLookup(pathname: string): boolean {
  return ["/login", "/profile", EQUIPMENT_DASHBOARD_HREF].some((p) => under(pathname, p));
}
