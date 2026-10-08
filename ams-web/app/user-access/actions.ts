"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/supabase/profile";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { INTERNAL_EQUIPMENT_HIDDEN_HREFS } from "@/lib/nav-items";

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
  const { error } = await supabase
    .from("profiles")
    .update({ hidden_modules: hiddenModules })
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
