"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WidgetSize = "sm" | "md" | "lg";
export type LayoutItem = { i: string; x: number; y: number; size: WidgetSize };

// Editable/movable/resizable Dashboard widgets (schema_step45.sql). Self-
// service, same as updateDisplayName (app/profile/actions.ts) — writes
// through the normal session client to the caller's OWN row, relying on
// the existing "update own display name" RLS policy (id = auth.uid()) now
// that dashboard_layout is granted to `authenticated`. Passing `null`
// clears it, which the page treats as "use the default layout for my
// role" — the Reset action.
export async function saveDashboardLayout(layout: LayoutItem[] | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase
    .from("profiles")
    .update({ dashboard_layout: layout })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
}
