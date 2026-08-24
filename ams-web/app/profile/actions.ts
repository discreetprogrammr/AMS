"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Self-service Edit Profile (schema_step37.sql) — both actions use the
// signed-in user's own session client, never the service-role client, so
// RLS + the column-level GRANT added in that migration are what actually
// enforce "only your own row, only full_name" — this file has no special
// privileges beyond what the signed-in user already has.
export async function updateDisplayName(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!fullName) {
    redirect(`/profile?error=${encodeURIComponent("Display name can't be empty.")}`);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    redirect(`/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/profile?updated=name");
}

// Supabase's updateUser({ password }) only requires a valid session (which
// the user already has, being signed in) — no "current password"
// re-verification step is exposed by that API, so this is standard
// "change your password while logged in" behavior, not full account
// re-authentication.
export async function updatePassword(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (newPassword.length < 6) {
    redirect(`/profile?error=${encodeURIComponent("Password must be at least 6 characters.")}`);
  }

  if (newPassword !== confirmPassword) {
    redirect(`/profile?error=${encodeURIComponent("Passwords don't match.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect(`/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/profile?updated=password");
}
