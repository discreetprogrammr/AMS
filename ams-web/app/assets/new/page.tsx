import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { AssetForm } from "../asset-form";
import { createAsset } from "../actions";

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const [{ data: organizations }, { data: sites }] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("sites")
      .select("id, address, organization_id")
      .order("address"),
  ]);

  return (
    <AppShell profile={profile} title="Add Asset">
      <div className="mx-auto max-w-2xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <AssetForm
          organizations={organizations ?? []}
          sites={sites ?? []}
          action={createAsset}
        />
      </div>
    </AppShell>
  );
}
