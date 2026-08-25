"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase/profile";
import { isStaffRole, isSuperAdminRole } from "@/lib/supabase/roles";
import { NAV_MODULES } from "@/lib/nav-items";
import { logout } from "@/app/login/actions";
import { useMobileNav } from "./mobile-nav";
import { MessagesUnreadDot } from "./messages-unread-dot";
import { UserAvatar } from "./user-avatar";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  staffOnly?: boolean;
  superAdminOnly?: boolean;
  clientOnly?: boolean;
  disabled?: boolean;
};

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  dashboard: "M3 12h6V3H3v9zm0 9h6v-6H3v6zm12 0h6V9h-6v12zm0-18v6h6V3h-6z",
  assets:
    "M12 2 3 6.5 12 11l9-4.5L12 2zM3 12l9 4.5 9-4.5M3 17l9 4.5 9-4.5",
  map: "M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Zm0 0v16m6-14v16",
  clients:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  workOrders: "M9 11 12 14 22 4M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11",
  tickets:
    "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V8Z",
  inspections:
    "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m-5 9 2 2 4-4",
  inventory:
    "M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  parts:
    "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73V8ZM3.3 7 12 12l8.7-5M12 22V12",
  scan:
    "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10",
  calendar:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  reports:
    "M3 3v18h18M8 17V10m5 7V4m5 13v-6",
  analytics:
    "M3 3v18h18M7 14l4-5 3 3 5-7M14 5h5v5",
  alerts:
    "M12 2a6 6 0 0 0-6 6c0 4.5-2 6-2 6h16s-2-1.5-2-6a6 6 0 0 0-6-6ZM10.3 21a1.94 1.94 0 0 0 3.4 0",
  audit:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-9 2 2 4-4",
  errorLogs:
    "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4m0 4h.01",
  userAccess:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 6c0-3.31 3.13-6 7-6s7 2.69 7 6M19 8v4m2-2h-4",
  slaPolicy: "M12 8v4l3 3M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  chat: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z",
  logout:
    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  close: "M18 6 6 18M6 6l12 12",
};

// href -> icon key, kept separate from lib/nav-items.ts's NAV_MODULES so
// that shared list stays pure data (reusable from a server component like
// app/user-access without dragging JSX/icons along) while this component
// still owns the visuals.
const ICON_BY_HREF: Record<string, keyof typeof ICONS> = {
  "/dashboard": "dashboard",
  "/assets": "assets",
  "/assets/scan": "scan",
  "/fleet-map": "map",
  "/clients": "clients",
  "/work-orders": "workOrders",
  "/tickets": "tickets",
  "/inspections": "inspections",
  "/inventory": "inventory",
  "/parts": "parts",
  "/messages": "chat",
  "/calendar": "calendar",
  "/reports": "reports",
  "/analytics": "analytics",
  "/alerts": "alerts",
  "/sla-settings": "slaPolicy",
  "/audit-log": "audit",
  "/error-logs": "errorLogs",
};

function buildNav(): NavItem[] {
  return [
    ...NAV_MODULES.map((m) => ({
      href: m.href,
      label: m.label,
      icon: <Icon d={ICONS[ICON_BY_HREF[m.href]]} />,
      staffOnly: m.staffOnly,
      superAdminOnly: m.superAdminOnly,
    })),
    // User Access (schema_step44.sql's per-user module visibility) is
    // deliberately NOT in lib/nav-items.ts's shared NAV_MODULES list — it
    // must never itself be hideable via hidden_modules, or the one Super
    // Admin could lock themselves out of the only page that grants access
    // back with no in-app recovery path.
    {
      href: "/user-access",
      label: "User Access",
      icon: <Icon d={ICONS.userAccess} />,
      staffOnly: true,
      superAdminOnly: true,
    },
  ];
}


export function Sidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const { open, setOpen } = useMobileNav();
  const isStaff = isStaffRole(profile?.role);
  const isSuperAdmin = isSuperAdminRole(profile?.role);
  // hidden_modules (schema_step44.sql, "User Access") is checked AFTER the
  // role gate, never instead of it — it can only take away a module a
  // user's role would otherwise show, never grant one their role blocks.
  // /user-access itself is excluded on purpose (see buildNav()'s comment).
  const hiddenModules = profile?.hidden_modules ?? [];
  const nav = buildNav().filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.staffOnly && !isStaff) return false;
    if (item.href !== "/user-access" && hiddenModules.includes(item.href)) return false;
    return true;
  });

  // Picks the single longest-matching href as "active" — needed now that
  // /assets/scan sits under /assets as its own sibling nav item rather
  // than a sub-page of it; a plain startsWith per item would highlight
  // both "Assets" and "Scan Asset" at once while on the scan page.
  const activeHref = nav
    .filter((item) => !item.disabled && pathname?.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Close the drawer automatically whenever the route changes — otherwise
  // tapping a nav link on mobile would navigate underneath a still-open
  // overlay.
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Backdrop — mobile only, tap to dismiss. Sidebar itself is `fixed`
          and off-canvas (`-translate-x-full`) below the `lg` breakpoint,
          sliding in as an overlay when `open`; at `lg` and up it switches
          to `sticky` and always sits inline in the page's flex layout, same
          as before this drawer existed. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col border-r border-hairline bg-surface transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt="HorizonCare360"
              className="h-9 w-9 shrink-0 rounded-lg bg-white p-1"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-ink">
                HorizonCare360
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                By Pacific Horizon Tek
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <Icon d={ICONS.close} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active = !item.disabled && item.href === activeHref;

          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-600"
                title="Coming soon"
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  {item.label}
                </span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600/15 text-blue-400"
                  : "text-ink-soft hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <span className="relative shrink-0">
                {item.icon}
                {item.href === "/messages" && profile?.id && (
                  <MessagesUnreadDot userId={profile.id} />
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-hairline p-4">
        <div className="flex items-center gap-3">
          {/* Whole block (except Sign out) links to /profile — the entry
              point for the self-service Edit Profile feature
              (schema_step37.sql). No separate "Settings" nav item; clicking
              your own name/avatar to edit it is the more obvious affordance
              here. */}
          <Link
            href="/profile"
            title="Edit profile"
            className="-m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 hover:bg-surface-2"
          >
            <UserAvatar fullName={profile?.full_name} avatarUrl={profile?.avatar_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {profile?.full_name ?? "Unknown User"}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                {isSuperAdmin ? "Super Admin" : isStaff ? "Admin" : "Client"}
              </p>
            </div>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              title="Sign out"
              className="rounded-lg p-2 text-slate-500 hover:bg-surface-2 hover:text-ink"
            >
              <Icon d={ICONS.logout} />
            </button>
          </form>
        </div>
      </div>
      </aside>
    </>
  );
}
