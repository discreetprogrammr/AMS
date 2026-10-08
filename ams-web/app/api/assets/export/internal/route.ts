import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  EVERY_VIEW,
  INTERNAL_EXPORT_HEADER,
  OWNERSHIPS,
  SEGMENTS,
  applyInternalFilters,
  labelFor,
  manilaDate,
  parseInternalFilters,
} from "@/lib/internal-equipment";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// "—" is for the screen; a CSV going back to Excel wants a blank cell.
const label = (options: Parameters<typeof labelFor>[0], value: string | null) =>
  value ? labelFor(options, value) : "";

// Spec 7.4: the PHtek equipment register as the spreadsheet's Equipment
// List columns plus Segment. Internal organizations only; the client
// export (../route.ts) excludes them. Applies the same filters as the
// /assets list (view, segment, custodian, department, category, warranty,
// and q) so "Export" gives what is on screen.
export async function GET(request: Request) {
  const profile = await getProfile();
  if (!isStaffRole(profile?.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = await createClient();
  const { data: orgs, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("is_internal", true);
  if (orgError) {
    return new Response(`Failed to export: ${orgError.message}`, { status: 500 });
  }
  const orgIds = (orgs ?? []).map((o) => o.id);

  const { searchParams } = new URL(request.url);
  const filters = parseInternalFilters(Object.fromEntries(searchParams));
  // A bare URL keeps the export's original meaning (every internal row,
  // retired included). The list page always sends view explicitly.
  if (!searchParams.has("view")) filters.view = EVERY_VIEW;
  // Same search as the list; commas split PostgREST's .or(), so drop them.
  const q = (searchParams.get("q") ?? "").trim().replace(/,/g, "");

  let query = supabase
    .from("assets")
    .select(
      "asset_tag, asset_category, description, brand, model, serial_number, quantity, ownership, date_acquired, acquisition_cost, supplier, custodian, department, date_issued, assignment_status, condition, warranty_end_date, return_disposal_date, remarks, segment, sites(address)",
    )
    .in("organization_id", orgIds)
    .order("asset_tag", { ascending: true });
  query = applyInternalFilters(query, filters, manilaDate());
  if (q) {
    query = query.or(
      `asset_tag.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,serial_number.ilike.%${q}%,description.ilike.%${q}%,custodian.ilike.%${q}%`,
    );
  }

  const { data: assets, error } = await query;

  if (error) {
    return new Response(`Failed to export: ${error.message}`, { status: 500 });
  }

  // Order must match INTERNAL_EXPORT_HEADER.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (assets ?? []).map((a: any) => [
    a.asset_tag,
    a.asset_category ?? "",
    a.description ?? "",
    a.brand ?? "",
    a.model ?? "",
    a.serial_number ?? "",
    a.quantity ?? "",
    "", // Unit: no database column
    label(OWNERSHIPS, a.ownership),
    a.date_acquired ?? "",
    a.acquisition_cost ?? "",
    a.supplier ?? "",
    a.sites?.address ?? "",
    a.custodian ?? "",
    a.department ?? "",
    a.date_issued ?? "",
    label(ASSIGNMENT_STATUSES, a.assignment_status),
    label(CONDITIONS, a.condition),
    a.warranty_end_date ?? "",
    a.return_disposal_date ?? "",
    a.remarks ?? "",
    label(SEGMENTS, a.segment),
  ]);

  // BOM so Excel reads UTF-8 (names, peso signs) correctly.
  const csv =
    "﻿" +
    [[...INTERNAL_EXPORT_HEADER], ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");

  const filename = `phtek-internal-equipment-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
