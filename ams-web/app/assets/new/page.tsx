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

  // Site is now a free-text field resolved server-side in createAsset()
  // (find-or-create against the sites table), so this page no longer needs
  // to fetch the sites list just to populate a dropdown.
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name");

  return (
    <AppShell profile={profile} title="Add Asset">
      <div className="mx-auto max-w-2xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <AssetForm organizations={organizations ?? []} action={createAsset} />
      </div>
    </AppShell>
  );
}
