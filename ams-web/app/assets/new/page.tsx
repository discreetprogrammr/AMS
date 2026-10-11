import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { AppShell } from "@/components/app-shell";
import { AssetForm } from "../asset-form";
import { createAsset, nextInternalAssetTag } from "../actions";

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: { error?: string; internal?: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  // HR & Admin preset: internal equipment only, so the client form is
  // never offered. (createAsset enforces this again on submit.)
  if (isHrAdminPreset(profile?.hidden_modules) && searchParams?.internal !== "1") {
    redirect("/assets/new?internal=1");
  }

  const supabase = await createClient();

  // Site is now a free-text field resolved server-side in createAsset()
  // (find-or-create against the sites table), so this page no longer needs
  // to fetch the sites list just to populate a dropdown.
  //
  // The internal organization (PHtek's own staff equipment) is offered
  // only through ?internal=1, where it is the single, locked choice. The
  // normal flow lists client organizations only.
  const internal = searchParams?.internal === "1";
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("is_internal", internal)
    .order("name");
  const suggestedTag = internal ? await nextInternalAssetTag(supabase) : undefined;

  return (
    <AppShell profile={profile} title={internal ? "Add Internal Equipment" : "Add Asset"}>
      <div className="mx-auto max-w-2xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <AssetForm
          organizations={organizations ?? []}
          action={createAsset}
          mode={internal ? "internal" : "client"}
          suggestedTag={suggestedTag}
          cancelHref={internal ? "/assets?org=" + (organizations?.[0]?.id ?? "") : "/assets"}
        />
      </div>
    </AppShell>
  );
}
