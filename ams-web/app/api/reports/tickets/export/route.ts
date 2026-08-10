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

  const { data: tickets, error } = await supabase
    .from("service_tickets")
    .select(
      "description, status, priority, created_at, first_response_at, resolved_at, assets(asset_tag, organizations(name))",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(`Failed to export: ${error.message}`, {
      status: 500,
    });
  }

  const header = [
    "Asset",
    "Organization",
    "Priority",
    "Status",
    "Description",
    "Created",
    "First Response",
    "Resolved",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (tickets ?? []).map((t: any) => [
    t.assets?.asset_tag ?? "",
    t.assets?.organizations?.name ?? "",
    t.priority,
    t.status,
    t.description,
    t.created_at,
    t.first_response_at ?? "",
    t.resolved_at ?? "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const filename = `service-tickets-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
