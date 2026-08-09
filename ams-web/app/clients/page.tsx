import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ClientsTable, type ClientRow } from "./clients-table";

export default async function ClientsPage() {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const [{ data: organizations, error }, { data: sites }, { data: assets }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, sector, primary_contact, email")
        .order("name"),
      supabase.from("sites").select("id, organization_id"),
      supabase.from("assets").select("id, organization_id"),
    ]);

  const siteCounts = new Map<string, number>();
  for (const s of sites ?? []) {
    siteCounts.set(s.organization_id, (siteCounts.get(s.organization_id) ?? 0) + 1);
  }
  const assetCounts = new Map<string, number>();
  for (const a of assets ?? []) {
    assetCounts.set(a.organization_id, (assetCounts.get(a.organization_id) ?? 0) + 1);
  }

  const clients: ClientRow[] = (organizations ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    sector: org.sector,
    primary_contact: org.primary_contact,
    email: org.email,
    siteCount: siteCounts.get(org.id) ?? 0,
    assetCount: assetCounts.get(org.id) ?? 0,
  }));

  return (
    <AppShell
      profile={profile}
      title="Clients"
      subtitle="Admin registry of every client organization and their sites."
      actions={
        <Link
          href="/clients/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          + Add Client
        </Link>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}
      <ClientsTable clients={clients} />
    </AppShell>
  );
}
