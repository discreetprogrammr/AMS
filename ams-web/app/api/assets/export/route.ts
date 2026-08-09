import { createClient } from "@/lib/supabase/server";

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
      "asset_tag, equipment_type, brand, model, serial_number, status, sold_by, install_date, warranty_end_date, next_service_due, custodian, pnri_license_number, organizations(name), sites(address)",
    )
    .order("asset_tag", { ascending: true });

  if (error) {
    return new Response(`Failed to export: ${error.message}`, {
      status: 500,
    });
  }

  const header = [
    "Asset Tag",
    "Organization",
    "Site",
    "Equipment Type",
    "Brand",
    "Model",
    "Serial Number",
    "Status",
    "Sold By",
    "Install Date",
    "Warranty End",
    "Next Service Due",
    "Custodian",
    "PNRI License #",
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
    a.status,
    a.sold_by,
    a.install_date ?? "",
    a.warranty_end_date ?? "",
    a.next_service_due ?? "",
    a.custodian ?? "",
    a.pnri_license_number ?? "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const filename = `assets-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
