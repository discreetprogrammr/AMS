"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Shared open/close state for the mobile sidebar drawer, so the hamburger
// button (in Topbar) and the drawer itself (in Sidebar) — two separate
// components, both rendered as siblings inside AppShell — can control the
// same piece of state without prop-drilling it through every page.tsx that
// renders <AppShell>.
type MobileNavContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    throw new Error("useMobileNav must be used within a MobileNavProvider");
  }
  return ctx;
}
