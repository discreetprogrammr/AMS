"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase/profile";
import { logout } from "@/app/login/actions";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  staffOnly?: boolean;
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
  calendar:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  reports:
    "M3 3v18h18M8 17V10m5 7V4m5 13v-6",
  alerts:
    "M12 2a6 6 0 0 0-6 6c0 4.5-2 6-2 6h16s-2-1.5-2-6a6 6 0 0 0-6-6ZM10.3 21a1.94 1.94 0 0 0 3.4 0",
  audit:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-9 2 2 4-4",
  chat: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z",
  logout:
    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

function buildNav(): NavItem[] {
  return [
    { href: "/dashboard", label: "Dashboard", icon: <Icon d={ICONS.dashboard} /> },
    { href: "/assets", label: "Assets", icon: <Icon d={ICONS.assets} /> },
    { href: "#", label: "Fleet Map", icon: <Icon d={ICONS.map} />, staffOnly: true, disabled: true },
    { href: "/clients", label: "Clients", icon: <Icon d={ICONS.clients} />, staffOnly: true },
    { href: "/work-orders", label: "Work Orders", icon: <Icon d={ICONS.workOrders} />, staffOnly: true },
    { href: "/tickets", label: "Tickets", icon: <Icon d={ICONS.tickets} />, staffOnly: true },
    { href: "#", label: "Inspections", icon: <Icon d={ICONS.inspections} />, staffOnly: true, disabled: true },
    { href: "/inventory", label: "Inventory", icon: <Icon d={ICONS.inventory} />, staffOnly: true },
    { href: "#", label: "Calendar", icon: <Icon d={ICONS.calendar} />, staffOnly: true, disabled: true },
    { href: "#", label: "Reports", icon: <Icon d={ICONS.reports} />, staffOnly: true, disabled: true },
    { href: "#", label: "Alerts", icon: <Icon d={ICONS.alerts} />, staffOnly: true, disabled: true },
    { href: "/audit-log", label: "Audit Log", icon: <Icon d={ICONS.audit} />, staffOnly: true },
    { href: "#", label: "HorizonCare360 Assist", icon: <Icon d={ICONS.chat} />, staffOnly: true, disabled: true },
  ];
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Sidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const isStaff = profile?.role === "internal_staff";
  const nav = buildNav().filter((item) => !item.staffOnly || isStaff);

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="flex items-center gap-3 border-b border-hairline px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mark.png"
          alt="HorizonCare360"
          className="h-9 w-9 rounded-lg bg-white p-1"
        />
        <div>
          <p className="text-sm font-bold leading-tight text-ink">
            HorizonCare360
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            By Pacific Horizon Tek
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active = !item.disabled && pathname?.startsWith(item.href);

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
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-hairline p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-ink">
            {initials(profile?.full_name ?? null)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {profile?.full_name ?? "Unknown User"}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
              {isStaff ? "Staff" : "Client"}
            </p>
          </div>
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
  );
}
