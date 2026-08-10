// Pure role-check helpers with ZERO server-only imports (no next/headers,
// no Supabase client). This file exists specifically so client components
// (e.g. components/sidebar.tsx) can import these functions directly without
// dragging in "./server" (which imports next/headers and breaks client
// bundling — see the "You're importing a component that needs next/headers"
// error this file was split out to fix). Server components/actions can
// still get everything from "./profile", which re-exports these.

export type Role = "super_admin" | "admin" | "client_viewer";

// "Staff" means either tier — Admin and Super Admin see the same tabs
// everywhere in the app EXCEPT Audit Log, which is Super Admin-only (see
// isSuperAdminRole below). Centralized here so every page checks the same
// way instead of repeating the role comparison inline (schema_step22.sql).
export function isStaffRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdminRole(role: Role | null | undefined): boolean {
  return role === "super_admin";
}
