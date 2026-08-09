import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AssetForm } from "../asset-form";
import { updateAsset } from "../actions";

export default async function EditAssetPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = await createClient();

  const [{ data: asset }, { data: organizations }, { data: sites }] =
    await Promise.all([
      supabase.from("assets").select("*").eq("id", params.id).single(),
      supabase.from("organizations").select("id, name").order("name"),
      supabase
        .from("sites")
        .select("id, address, organization_id")
        .order("address"),
    ]);

  if (!asset) notFound();

  const boundUpdate = updateAsset.bind(null, params.id);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">
        Edit Asset — {asset.asset_tag}
      </h1>
      {searchParams?.error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}
      <AssetForm
        organizations={organizations ?? []}
        sites={sites ?? []}
        action={boundUpdate}
        defaultValues={asset}
        submitLabel="Update Asset"
      />
    </div>
  );
}
