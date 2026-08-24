import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { PartsTable, type PartRow } from "./parts-table";

export default async function PartsPage({
  searchParams,
}: {
  searchParams: { created?: string; saved?: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: parts, error } = await supabase
    .from("parts")
    .select(
      "id, name, sku, category, unit, quantity_on_hand, reorder_level, unit_cost, updated_at",
    )
    .order("name");

  const rows: PartRow[] = (parts ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    unit: p.unit,
    quantity_on_hand: p.quantity_on_hand,
    reorder_level: p.reorder_level,
    unit_cost: p.unit_cost,
    updated_at: p.updated_at,
  }));

  return (
    <AppShell
      profile={profile}
      title="Inventory"
      subtitle="Spare-parts and consumables stock levels — separate from Asset Verification, which counts assets, not parts."
      actions={
        <>
          <Link
            href="/parts/import"
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Import CSV
          </Link>
          <Link
            href="/parts/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
          >
            + Add Part
          </Link>
        </>
      }
    >
      {searchParams?.created === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Part added.
        </p>
      )}
      {searchParams?.saved === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Changes saved.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message} (have you run schema_step31.sql?)
        </p>
      )}
      <PartsTable parts={rows} />
    </AppShell>
  );
}
