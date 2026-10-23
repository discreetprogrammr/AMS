// Pure role-check helpers with ZERO server-only imports (no next/headers,
// no Supabase client). This file exists specifically so client components
// (e.g. components/sidebar.tsx) can import these functions directly without
// dragging in "./server" (which imports next/headers and breaks client
// bundling — see the "You're importing a component that needs next/headers"
// error this file was split out to fix). Server components/actions can
// still get everything from "./profile", which re-exports these.

export type Role = "super_admin" | "admin" | "client_viewer" | "field_engineer";

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

// A field engineer (schema_step56.sql, schema_step57.sql) is a technician who
// works from the HorizonCare360 Assist mobile app. They are not "staff" above:
// the database keeps them out of every staff table, and the web app sends
// them to /use-the-app. A limited web view for them is a later phase.
export function isFieldEngineerRole(role: Role | null | undefined): boolean {
  return role === "field_engineer";
}
