import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { manilaDate } from "@/lib/internal-equipment";
import { dateTimeLabel } from "@/lib/format";
import { stocktakeResultLabel } from "@/lib/stocktake";
import { forbidViewer } from "@/lib/viewer-guard";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// One stocktake as a CSV: every item with its expected holder, result,
// actual holder and note. Staff only; internal equipment only (that is all
// the stocktake tables hold). Not blocked for the HR & Admin preset, who
// need it.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  // A read-only viewer account gets no downloads and no writes (lib/viewer-guard.ts).
  const viewerBlocked = await forbidViewer();
  if (viewerBlocked) return viewerBlocked;

  const profile = await getProfile();
  if (!isStaffRole(profile?.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = await createClient();
  const { data: stocktake } = await supabase
    .from("equipment_stocktakes")
    .select("name")
    .eq("id", params.id)
    .maybeSingle();
  if (!stocktake) return new Response("Stocktake not found.", { status: 404 });

  const { data: items, error } = await supabase
    .from("equipment_stocktake_items")
    .select(
      "asset_tag, description, expected_custodian, expected_department, result, actual_custodian, condition_note, checked_at",
    )
    .eq("stocktake_id", params.id)
    .order("asset_tag", { ascending: true });
  if (error) return new Response(`Failed to export: ${error.message}`, { status: 500 });

  const header = [
    "Asset No.",
    "Item",
    "Expected Custodian",
    "Expected Department",
    "Result",
    "Actual Custodian",
    "Condition Note",
    "Counted At",
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (items ?? []).map((i: any) => [
    i.asset_tag,
    i.description ?? "",
    i.expected_custodian ?? "",
    i.expected_department ?? "",
    stocktakeResultLabel(i.result),
    i.actual_custodian ?? "",
    i.condition_note ?? "",
    i.checked_at ? dateTimeLabel(i.checked_at) : "",
  ]);

  // BOM so Excel reads UTF-8 correctly.
  const csv = "﻿" + [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const slug = stocktake.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stocktake";
  const filename = `phtek-stocktake-${slug}-${manilaDate()}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
