import { createClient } from "@/lib/supabase/server";
import { AssetForm } from "../asset-form";
import { createAsset } from "../actions";

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = await createClient();

  const [{ data: organizations }, { data: sites }] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("sites")
      .select("id, address, organization_id")
      .order("address"),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Add Asset</h1>
      {searchParams?.error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}
      <AssetForm
        organizations={organizations ?? []}
        sites={sites ?? []}
        action={createAsset}
      />
    </div>
  );
}
