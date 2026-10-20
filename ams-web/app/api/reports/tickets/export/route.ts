import { createClient } from "@/lib/supabase/server";
import { excludeInternal, getInternalOrgIds } from "@/lib/internal-org";
import { forbidHrAdminPreset } from "@/lib/hr-admin-guard";
import { forbidViewer } from "@/lib/viewer-guard";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET() {
  // A read-only viewer account gets no downloads and no writes (lib/viewer-guard.ts).
  const viewerBlocked = await forbidViewer();
  if (viewerBlocked) return viewerBlocked;

  // HR & Admin preset users get nothing from client-facing routes.
  const forbidden = await forbidHrAdminPreset();
  if (forbidden) return forbidden;

  const supabase = await createClient();

  const { data: tickets, error } = await excludeInternal(
    supabase
      .from("service_tickets")
      .select(
        "description, status, priority, created_at, first_response_at, resolved_at, assets!inner(asset_tag, organizations(name))",
      )
      .order("created_at", { ascending: false }),
    await getInternalOrgIds(supabase),
    "assets.organization_id",
  );

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
