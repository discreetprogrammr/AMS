"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";
import { useMobileNav } from "./mobile-nav";

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { setOpen } = useMobileNav();

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-base/80 px-4 py-4 backdrop-blur sm:px-6 lg:px-8 lg:py-5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-1 shrink-0 rounded-lg p-2 text-ink-soft hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          <MenuIcon />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-ink sm:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-sm text-ink-soft">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
