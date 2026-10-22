import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase/profile";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNavProvider } from "./mobile-nav";
import { IncomingCallBanner } from "./incoming-call-banner";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { isStaffRole } from "@/lib/supabase/roles";

// Shared page shell: sidebar + topbar around a scrollable content area.
// Every page wraps its content in this instead of hand-rolling its own nav
// header, so the nav lives in one place. Sandbox constraint: written files
// can't be deleted/moved here, so this is a plain component each page
// imports rather than a Next.js layout route group (which would require
// relocating existing page.tsx files).
export function AppShell({
  profile,
  title,
  subtitle,
  actions,
  children,
}: {
  profile: Profile | null;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  // Staff hear a client's call on any page. The HR & Admin preset gets no
  // client-facing calling, the same rule as push (hidePush below).
  const hearsCalls =
    isStaffRole(profile?.role) && (profile?.role === "super_admin" || !isHrAdminPreset(profile?.hidden_modules));

  return (
    <MobileNavProvider>
      {hearsCalls && <IncomingCallBanner />}
      <div className="flex min-h-screen">
        <Sidebar profile={profile} />
        {/* min-w-0 stops this flex child from being stretched by wide
            content (e.g. a table) beyond its allotted width — without it,
            an inner `overflow-x-auto` wrapper has nothing to actually
            scroll within on narrow viewports. */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar
            title={title}
            subtitle={subtitle}
            actions={actions}
            hidePush={profile?.role !== "super_admin" && isHrAdminPreset(profile?.hidden_modules)}
          />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
