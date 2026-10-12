import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase/profile";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNavProvider } from "./mobile-nav";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { isViewerRole } from "@/lib/supabase/roles";
import { ViewOnlyGuard, ViewOnlyProvider } from "./view-only";

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
  // A read-only viewer (schema_step53.sql): everything is shown, nothing can be
  // changed. The banner says so, the guard stops writing forms, and the provider
  // lets controls that call an action from a click disable themselves.
  const viewer = isViewerRole(profile?.role);
  const content = (
    <MobileNavProvider>
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
            hidePush={viewer || (profile?.role !== "super_admin" && isHrAdminPreset(profile?.hidden_modules))}
          />
          {viewer && (
            <div className="border-b border-blue-500/30 bg-blue-500/10 px-4 py-2 text-center text-xs font-medium text-blue-400 sm:px-6 lg:px-8">
              View-only account: you can look around, but nothing can be added, edited, deleted or sent.
            </div>
          )}
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );

  return viewer ? (
    <ViewOnlyProvider>
      <ViewOnlyGuard />
      {content}
    </ViewOnlyProvider>
  ) : (
    content
  );
}
