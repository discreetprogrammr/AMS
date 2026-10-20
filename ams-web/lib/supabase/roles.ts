// Pure role-check helpers with ZERO server-only imports (no next/headers,
// no Supabase client). This file exists specifically so client components
// (e.g. components/sidebar.tsx) can import these functions directly without
// dragging in "./server" (which imports next/headers and breaks client
// bundling — see the "You're importing a component that needs next/headers"
// error this file was split out to fix). Server components/actions can
// still get everything from "./profile", which re-exports these.

// "viewer" (schema_step54.sql, demo database only) is a read-only account that
// sees every staff screen but can change nothing. It is NOT staff: isStaffRole()
// stays false for it, so every write path that gates on staff keeps refusing it.
export type Role = "super_admin" | "admin" | "client_viewer" | "viewer";

// "Staff" means either tier — Admin and Super Admin see the same tabs
// everywhere in the app EXCEPT Audit Log, which is Super Admin-only (see
// isSuperAdminRole below). Centralized here so every page checks the same
// way instead of repeating the role comparison inline (schema_step22.sql).
export function isStaffRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function isViewerRole(role: Role | null | undefined): boolean {
  return role === "viewer";
}

/** May look at the staff screens: staff, or a read-only viewer. Never use this to allow a write. */
export function isStaffViewRole(role: Role | null | undefined): boolean {
  return isStaffRole(role) || isViewerRole(role);
}

export function isSuperAdminRole(role: Role | null | undefined): boolean {
  return role === "super_admin";
}
