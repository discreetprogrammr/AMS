import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ImportPartsForm } from "./import-parts-form";

// Bulk Inventory (Parts) Import — same idea as Assets' bulk import,
// staff-only end to end (parts stock is internal ops, not part of the
// client portal — same reasoning as every other write path on Parts).
export default async function ImportPartsPage() {
  await requireStaff("/parts");
  const profile = await getProfile();

  return (
    <AppShell
      profile={profile}
      title="Import Inventory"
      subtitle="Bulk-add parts from a CSV file instead of one at a time."
    >
      <div className="mx-auto max-w-2xl">
        <ImportPartsForm />
      </div>
    </AppShell>
  );
}
