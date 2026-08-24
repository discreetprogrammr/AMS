"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/profile";

// Editing is Super Admin-only — explicit ask, stricter than this app's
// usual "any staff" write boundary (schema_step40.sql's header comment
// explains why: an SLA target is closer to a contractual commitment than
// routine data entry). requireSuperAdmin() is the same defense-in-depth
// helper Audit Log uses — the real boundary is is_super_admin() in RLS,
// this just turns a blocked write into a clean redirect instead of a raw
// Postgres error.
// Returns null (rather than throwing) for an invalid value — callers check
// for null and redirect with an error before doing anything else, same
// early-return-on-bad-input shape the rest of this app's actions use.
function parseHours(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function updateGlobalSlaPolicy(formData: FormData) {
  await requireSuperAdmin("/sla-settings");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const responseHours = parseHours(formData.get("response_target_hours"));
  const resolutionHours = parseHours(formData.get("resolution_target_hours"));
  if (responseHours === null || resolutionHours === null) {
    redirect(`/sla-settings?error=${encodeURIComponent("Response and resolution targets must be positive numbers.")}`);
  }

  const { error } = await supabase
    .from("sla_policies")
    .update({
      response_target_hours: responseHours,
      resolution_target_hours: resolutionHours,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("is_global", true);

  if (error) {
    redirect(`/sla-settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/sla-settings");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  redirect("/sla-settings?updated=global");
}

// Handles both "add a new override" and "edit an existing one" — checked
// via a plain select-then-insert-or-update rather than .upsert(onConflict:
// "organization_id"), since that constraint is a *partial* unique index
// (schema_step40.sql — only enforced where organization_id is not null,
// specifically to allow the single global row's organization_id to stay
// null without colliding). Postgres's ON CONFLICT needs its target to
// exactly match a partial index's predicate to use it as the arbiter;
// hand-rolling the check-then-write sidesteps that entirely rather than
// depending on Supabase's upsert() generating a matching clause.
export async function upsertOrgSlaPolicy(formData: FormData) {
  await requireSuperAdmin("/sla-settings");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) {
    redirect(`/sla-settings?error=${encodeURIComponent("Please choose a client organization.")}`);
  }

  const responseHours = parseHours(formData.get("response_target_hours"));
  const resolutionHours = parseHours(formData.get("resolution_target_hours"));
  if (responseHours === null || resolutionHours === null) {
    redirect(`/sla-settings?error=${encodeURIComponent("Response and resolution targets must be positive numbers.")}`);
  }

  const { data: existing } = await supabase
    .from("sla_policies")
    .select("id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const payload = {
    organization_id: organizationId,
    is_global: false,
    response_target_hours: responseHours,
    resolution_target_hours: resolutionHours,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("sla_policies").update(payload).eq("id", existing.id)
    : await supabase.from("sla_policies").insert(payload);

  if (error) {
    redirect(`/sla-settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/sla-settings");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  redirect("/sla-settings?updated=org");
}

export async function deleteOrgSlaPolicy(policyId: string) {
  await requireSuperAdmin("/sla-settings");

  const supabase = await createClient();
  const { error } = await supabase.from("sla_policies").delete().eq("id", policyId);

  if (error) {
    redirect(`/sla-settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/sla-settings");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  redirect("/sla-settings?updated=removed");
}
