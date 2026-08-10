"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { resolveSiteCoordinates } from "@/lib/site-location";

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

// Staff-only, called from the row actions menu on /clients after a confirm
// dialog. Sites and assets both declare `organization_id ... on delete
// cascade`, so this is a real cascading delete for a client's operational
// data — the confirm dialog says as much. The one thing that does NOT
// cascade on purpose is profiles.organization_id (a client_viewer login
// tied to this org): Postgres will refuse the delete with a foreign key
// error rather than silently orphaning or nuking someone's account, and
// that error is translated into a plain-language message below instead of
// a raw Postgres error string.
export async function deleteOrganization(id: string) {
  await requireStaff("/clients");

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").delete().eq("id", id);

  if (error) {
    const message = error.message.includes("profiles")
      ? "Can't delete — this client still has a portal user account linked to it. Remove that account's access first."
      : error.message;
    redirect(`/clients?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/clients");
  redirect("/clients?deleted=1");
}

export async function createSite(organizationId: string, formData: FormData) {
  await requireStaff(`/clients/${organizationId}`);

  const supabase = await createClient();

  const address = String(formData.get("address") ?? "").trim() || null;
  const site_contact = String(formData.get("site_contact") ?? "").trim() || null;
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  let latitude = latitudeRaw ? Number(latitudeRaw) : null;
  let longitude = longitudeRaw ? Number(longitudeRaw) : null;

  if (!address) {
    redirect(
      `/clients/${organizationId}?error=${encodeURIComponent("Site address is required.")}`,
    );
  }

  // Lat/lng on this form have always been optional manual fields — if
  // nobody typed them in, try to resolve a location automatically instead
  // of leaving the site uncharted (same helper the Assets page's
  // free-text Site field uses). A manually typed value always wins.
  if (latitude === null && longitude === null && address) {
    const resolved = await resolveSiteCoordinates(address);
    latitude = resolved.latitude;
    longitude = resolved.longitude;
  }

  const { error } = await supabase.from("sites").insert({
    organization_id: organizationId,
    address,
    site_contact,
    latitude,
    longitude,
  });

  if (error) {
    redirect(`/clients/${organizationId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/clients/${organizationId}`);
  redirect(`/clients/${organizationId}?saved=1`);
}

// Retrofits coordinates onto a site that already exists — most sites
// predate the Fleet Map module (Step 14), so this is the way to make an
// existing site show up on the map without recreating it. Lat/lng only;
// the rest of a site's fields are edited inline in the sites list already.
export async function updateSiteLocation(
  organizationId: string,
  siteId: string,
  formData: FormData,
) {
  await requireStaff(`/clients/${organizationId}`);

  const supabase = await createClient();

  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;

  const { error } = await supabase
    .from("sites")
    .update({ latitude, longitude })
    .eq("id", siteId);

  if (error) {
    redirect(`/clients/${organizationId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/clients/${organizationId}`);
  revalidatePath("/fleet-map");
  redirect(`/clients/${organizationId}?saved=1`);
}
