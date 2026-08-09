import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

export function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-base/80 px-8 py-5 backdrop-blur">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
