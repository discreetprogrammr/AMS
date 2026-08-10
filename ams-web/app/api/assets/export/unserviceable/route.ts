import { createClient } from "@/lib/supabase/server";

// Dedicated unserviceable-equipment report — the AMS equivalent of COA's
// Inspection and Inventory Report of Unserviceable Property (IIRUP).
function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET() {
  const supabase = await createClient();

  const { data: assets, error } = await supabase
    .from("assets")
    .select(
      "asset_tag, equipment_type, brand, model, serial_number, custodian, sold_by, install_date, organizations(name), sites(address)",
    )
    .eq("status", "unserviceable")
    .order("asset_tag", { ascending: true });

  if (error) {
    return new Response(`Failed to export: ${error.message}`, {
      status: 500,
    });
  }

  const header = [
    "Asset ID",
    "Organization",
    "Site",
    "Equipment Type",
    "Brand",
    "Model",
    "Serial Number",
    "Custodian",
    "Sold By",
    "Install Date",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (assets ?? []).map((a: any) => [
    a.asset_tag,
    a.organizations?.name ?? "",
    a.sites?.address ?? "",
    a.equipment_type,
    a.brand ?? "",
    a.model ?? "",
    a.serial_number ?? "",
    a.custodian ?? "",
    a.sold_by,
    a.install_date ?? "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const filename = `unserviceable-assets-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
