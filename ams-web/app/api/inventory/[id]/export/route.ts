import { createClient } from "@/lib/supabase/server";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from("inventory_cycles")
    .select("label")
    .eq("id", params.id)
    .single();

  const { data: items, error } = await supabase
    .from("inventory_cycle_items")
    .select(
      "verified, verified_at, condition_notes, assets(asset_tag, equipment_type, brand, model, status)",
    )
    .eq("inventory_cycle_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return new Response(`Failed to export: ${error.message}`, {
      status: 500,
    });
  }

  const header = [
    "Asset ID",
    "Equipment Type",
    "Brand",
    "Model",
    "Current Status",
    "Verified",
    "Verified At",
    "Condition Notes",
    "Discrepancy",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (items ?? []).map((i: any) => [
    i.assets?.asset_tag ?? "",
    i.assets?.equipment_type ?? "",
    i.assets?.brand ?? "",
    i.assets?.model ?? "",
    i.assets?.status ?? "",
    i.verified ? "Yes" : "No",
    i.verified_at ?? "",
    i.condition_notes ?? "",
    i.verified ? "" : "Yes — not verified during count",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const safeLabel = (cycle?.label ?? "inventory-cycle").replace(
    /[^a-z0-9]+/gi,
    "-",
  );
  const filename = `${safeLabel}-reconciliation.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
