import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { AssetScanner } from "./asset-scanner";

export default async function ScanAssetPage() {
  await requireStaff("/assets");
  const profile = await getProfile();

  return (
    <AppShell
      profile={profile}
      title="Scan Asset"
      subtitle="Scan a QR tag or serial-number barcode to jump straight to that asset."
    >
      <AssetScanner />
    </AppShell>
  );
}
