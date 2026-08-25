"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/supabase/profile";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
