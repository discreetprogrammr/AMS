"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/supabase/profile";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { INTERNAL_EQUIPMENT_HIDDEN_HREFS } from "@/lib/nav-items";
import { HR_ADMIN_ACTIVITY_MARKER, HR_ADMIN_PRESET_MARKER, hrAdminHiddenModules } from "@/lib/hr-admin-preset";

// User Access (schema_step44.sql) — Super Admin picking which sidebar
// modules a specific staff or client account sees. hidden_modules is
// deliberately NOT in profiles' `authenticated` column grants (unlike
// full_name/avatar_url, schema_step37/38.sql), so the normal session
// client can't write it at all, even for staff editing their own row.
// requireSuperAdmin() here is the real gate; the service-role client is
// just how the write actually happens, same pattern the cron jobs already
// use to write `alerts` on behalf of no signed-in user at all.
export async function updateHiddenModules(userId: string, hiddenModules: string[]) {
  await requireSuperAdmin();

  const supabase = createServiceRoleClient();

  // The "HR & Admin" preset marker is never accepted from the client, and
  // is kept if the user already has it: ticking boxes on a preset user must
  // not quietly turn them into an ordinary admin (use "Remove HR & Admin
  // preset" for that).
  const { data: current } = await supabase.from("profiles").select("hidden_modules").eq("id", userId).single();
  const keepMarker = (current?.hidden_modules ?? []).includes(HR_ADMIN_PRESET_MARKER);
  const keepActivity = keepMarker && (current?.hidden_modules ?? []).includes(HR_ADMIN_ACTIVITY_MARKER);
  const next = hiddenModules.filter((h) => h !== HR_ADMIN_PRESET_MARKER && h !== HR_ADMIN_ACTIVITY_MARKER);
  if (keepMarker) next.push(HR_ADMIN_PRESET_MARKER);
  if (keepActivity) next.push(HR_ADMIN_ACTIVITY_MARKER);

  const { error } = await supabase
    .from("profiles")
    .update({ hidden_modules: next })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/user-access");
}

// "Internal equipment only" preset (internal equipment spec section 5.2).
// Overwrites hidden_modules with exactly INTERNAL_EQUIPMENT_HIDDEN_HREFS.
// Same Super Admin gate and service-role write as updateHiddenModules; it
// refuses super_admin targets because middleware exempts them anyway and
// the page never lists them. Returns the stored list so the client can
// sync its checkboxes.
export async function applyInternalEquipmentPreset(userId: string) {
  await requireSuperAdmin();

  const supabase = createServiceRoleClient();
  const { data: target, error: lookupError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (lookupError) {
    throw new Error(lookupError.message);
  }
  if (target.role !== "admin" && target.role !== "client_viewer") {
    throw new Error("The preset can only be applied to admin and client accounts.");
  }

  const hidden = [...INTERNAL_EQUIPMENT_HIDDEN_HREFS];
  const { error } = await supabase.from("profiles").update({ hidden_modules: hidden }).eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/user-access");
  return hidden;
}

// "HR & Admin (internal equipment)" preset: Dashboard (their own internal
// dashboard) and Assets only, internal equipment only. Hides every module
// but Assets and stores the marker that lib/hr-admin-preset.ts looks for.
// Admin accounts only: a client_viewer must never be given Assets-with-
// write access by a preset, and super_admin is exempt from all of this.
export async function applyHrAdminPreset(userId: string) {
  await requireSuperAdmin();

  const supabase = createServiceRoleClient();
  const { data: target, error: lookupError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (lookupError) {
    throw new Error(lookupError.message);
  }
  if (target.role !== "admin") {
    throw new Error("The HR & Admin preset can only be applied to admin accounts.");
  }

  // Re-applying the preset must not take back a permission already granted.
  const { data: existing } = await supabase.from("profiles").select("hidden_modules").eq("id", userId).single();
  const hidden = hrAdminHiddenModules();
  if ((existing?.hidden_modules ?? []).includes(HR_ADMIN_ACTIVITY_MARKER)) hidden.push(HR_ADMIN_ACTIVITY_MARKER);
  const { error } = await supabase.from("profiles").update({ hidden_modules: hidden }).eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/user-access");
  return hidden;
}

// Back to an ordinary admin: nothing hidden. Only for HR & Admin preset
// users, whose checkboxes are not shown (see user-access-list.tsx).
export async function removeHrAdminPreset(userId: string) {
  await requireSuperAdmin();

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("profiles").update({ hidden_modules: [] }).eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/user-access");
  return [] as string[];
}

// Switch the Activity tab (the register's change history) on or off for one
// HR & Admin user. Super Admin only; the user must already have the preset.
export async function setHrAdminActivityAccess(userId: string, enabled: boolean) {
  await requireSuperAdmin();

  const supabase = createServiceRoleClient();
  const { data: target, error: lookupError } = await supabase
    .from("profiles")
    .select("hidden_modules")
    .eq("id", userId)
    .single();
  if (lookupError) {
    throw new Error(lookupError.message);
  }
  const current: string[] = target.hidden_modules ?? [];
  if (!current.includes(HR_ADMIN_PRESET_MARKER)) {
    throw new Error("The Activity permission can only be set on HR & Admin accounts.");
  }

  const without = current.filter((h) => h !== HR_ADMIN_ACTIVITY_MARKER);
  const next = enabled ? [...without, HR_ADMIN_ACTIVITY_MARKER] : without;
  const { error } = await supabase.from("profiles").update({ hidden_modules: next }).eq("id", userId);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/user-access");
  return enabled;
}
