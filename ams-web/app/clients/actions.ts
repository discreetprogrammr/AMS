"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

export async function createOrganization(formData: FormData) {
  await requireStaff("/clients");

  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const sector = String(formData.get("sector") ?? "").trim() || null;
  const primary_contact =
    String(formData.get("primary_contact") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;

  if (!name) {
    redirect(`/clients/new?error=${encodeURIComponent("Client name is required.")}`);
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name, sector, primary_contact, email })
    .select("id")
    .single();

  if (error) {
    redirect(`/clients/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/clients");
  redirect(`/clients/${data!.id}`);
}

export async function updateOrganization(id: string, formData: FormData) {
  await requireStaff(`/clients/${id}`);

  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const sector = String(formData.get("sector") ?? "").trim() || null;
  const primary_contact =
    String(formData.get("primary_contact") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;

  if (!name) {
    redirect(`/clients/${id}?error=${encodeURIComponent("Client name is required.")}`);
  }

  const { error } = await supabase
    .from("organizations")
    .update({ name, sector, primary_contact, email })
    .eq("id", id);

  if (error) {
    redirect(`/clients/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}?saved=1`);
}

export async function createSite(organizationId: string, formData: FormData) {
  await requireStaff(`/clients/${organizationId}`);

  const supabase = await createClient();

  const address = String(formData.get("address") ?? "").trim() || null;
  const site_contact = String(formData.get("site_contact") ?? "").trim() || null;

  if (!address) {
    redirect(
      `/clients/${organizationId}?error=${encodeURIComponent("Site address is required.")}`,
    );
  }

  const { error } = await supabase
    .from("sites")
    .insert({ organization_id: organizationId, address, site_contact });

  if (error) {
    redirect(`/clients/${organizationId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/clients/${organizationId}`);
  redirect(`/clients/${organizationId}?saved=1`);
}
