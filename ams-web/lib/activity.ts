// Activity: a readable log of changes to the company equipment register, for
// HR & Admin. The raw record is audit_log (written by the log_audit trigger),
// but its RLS shows it to Super Admin only, and it holds every record in the
// system. This reads it with the service-role client, strictly narrowed to
// internal equipment, and turns each row into a sentence. Callers must have
// checked canViewActivity() (lib/hr-admin-preset.ts) first: Super Admin, or
// an HR & Admin user the Super Admin has given the Activity permission.
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getInternalOrgIds, getInternalScope } from "@/lib/internal-org";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  OWNERSHIPS,
  SEGMENTS,
  labelFor,
} from "@/lib/internal-equipment";
import { changedFields } from "@/lib/audit";

export type ActivityKind = "added" | "changed" | "deleted" | "file";

export type ActivityEntry = {
  id: string;
  at: string;
  who: string;
  kind: ActivityKind;
  assetId: string | null;
  assetTag: string;
  item: string;
  lines: string[]; // what changed, one short phrase each
};

// The fields a person recognises, in the words they use. Anything not here
// (internal ids, derived operating status, timestamps) is not reported.
const FIELD_LABEL: Record<string, string> = {
  asset_tag: "Asset No.",
  asset_category: "Category",
  description: "Description",
  brand: "Brand",
  model: "Model",
  serial_number: "Serial No.",
  quantity: "Qty",
  ownership: "Ownership",
  supplier: "Supplier",
  date_acquired: "Date acquired",
  acquisition_cost: "Acquisition cost",
  custodian: "Custodian",
  department: "Department",
  date_issued: "Date issued",
  assignment_status: "Status",
  condition: "Condition",
  warranty_end_date: "Warranty expiry",
  return_disposal_date: "Return / disposal date",
  remarks: "Remarks",
  segment: "Segment",
  site_id: "Location",
};

function valueText(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  const s = String(v);
  switch (field) {
    case "assignment_status":
      return labelFor(ASSIGNMENT_STATUSES, s);
    case "condition":
      return labelFor(CONDITIONS, s);
    case "ownership":
      return labelFor(OWNERSHIPS, s);
    case "segment":
      return labelFor(SEGMENTS, s);
    default:
      return s.length > 60 ? s.slice(0, 57) + "…" : s;
  }
}

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  profiles: { full_name: string | null } | null;
};

function describe(row: AuditRow): ActivityEntry | null {
  const data = (row.new_data ?? row.old_data ?? {}) as Record<string, unknown>;
  const who = row.profiles?.full_name ?? "System";

  if (row.table_name === "asset_documents") {
    const title = String(data.title ?? data.file_name ?? "a file");
    if (row.action === "UPDATE") return null;
    return {
      id: row.id,
      at: row.changed_at,
      who,
      kind: "file",
      assetId: typeof data.asset_id === "string" ? data.asset_id : null,
      assetTag: "",
      item: title,
      lines: [row.action === "INSERT" ? "File added" : "File deleted"],
    };
  }

  const tag = String(data.asset_tag ?? "");
  const item = String(data.description ?? ([data.brand, data.model].filter(Boolean).join(" ") || ""));
  const base = { id: row.id, at: row.changed_at, who, assetId: row.record_id, assetTag: tag, item };

  if (row.action === "INSERT") return { ...base, kind: "added", lines: [] };
  if (row.action === "DELETE") return { ...base, kind: "deleted", lines: [] };

  const lines = changedFields(row.old_data, row.new_data)
    .filter((f) => f in FIELD_LABEL)
    .map((f) =>
      f === "site_id"
        ? "Location changed"
        : `${FIELD_LABEL[f]}: ${valueText(f, row.old_data?.[f])} → ${valueText(f, row.new_data?.[f])}`,
    );
  // A row that only touched fields nobody reads (derived status, timestamps) is noise.
  if (lines.length === 0) return null;
  return { ...base, kind: "changed", lines };
}

/**
 * Recent changes to internal equipment, newest first. `assetId` narrows to
 * one item. Nothing outside the internal organizations is ever returned: the
 * asset rows are filtered by organization in the query, the file rows by the
 * internal asset ids.
 */
export async function loadInternalActivity(opts: {
  sinceDays?: number | null;
  assetId?: string;
  limit?: number;
}): Promise<{ entries: ActivityEntry[]; error: string | null }> {
  const supabase = createServiceRoleClient();
  const orgIds = await getInternalOrgIds(supabase);
  if (orgIds.length === 0) return { entries: [], error: null };
  const since = opts.sinceDays ? new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString() : null;
  const limit = opts.limit ?? 200;
  const list = orgIds.join(",");
  const SELECT = "id, table_name, record_id, action, changed_at, old_data, new_data, profiles(full_name)";

  let assetQuery = supabase
    .from("audit_log")
    .select(SELECT)
    .eq("table_name", "assets")
    .or(`new_data->>organization_id.in.(${list}),old_data->>organization_id.in.(${list})`)
    .order("changed_at", { ascending: false })
    .limit(500);
  if (since) assetQuery = assetQuery.gte("changed_at", since);
  if (opts.assetId) assetQuery = assetQuery.eq("record_id", opts.assetId);

  let fileQuery = supabase
    .from("audit_log")
    .select(SELECT)
    .eq("table_name", "asset_documents")
    .order("changed_at", { ascending: false })
    .limit(300);
  if (since) fileQuery = fileQuery.gte("changed_at", since);

  const [assets, files, scope] = await Promise.all([assetQuery, fileQuery, getInternalScope(supabase)]);
  if (assets.error) return { entries: [], error: assets.error.message };

  const internalFileRows = ((files.data ?? []) as unknown as AuditRow[]).filter((r) => {
    const assetId = (r.new_data ?? r.old_data)?.asset_id;
    if (typeof assetId !== "string" || !scope.assetIds.has(assetId)) return false;
    return !opts.assetId || assetId === opts.assetId;
  });

  const entries = [...((assets.data ?? []) as unknown as AuditRow[]), ...internalFileRows]
    .map(describe)
    .filter((e): e is ActivityEntry => e !== null)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);

  // File rows carry the asset id but not its tag: fill it in.
  const tags = new Map<string, string>();
  for (const e of entries) if (e.assetTag) tags.set(e.assetId ?? "", e.assetTag);
  const missing = entries.filter((e) => e.kind === "file" && e.assetId && !tags.has(e.assetId));
  if (missing.length > 0) {
    const ids = Array.from(new Set(missing.map((e) => e.assetId as string)));
    const { data } = await supabase.from("assets").select("id, asset_tag").in("id", ids);
    for (const a of data ?? []) tags.set(a.id, a.asset_tag);
  }
  for (const e of entries) if (e.kind === "file" && e.assetId) e.assetTag = tags.get(e.assetId) ?? "";

  // Link only to items that still exist.
  for (const e of entries) if (e.assetId && !scope.assetIds.has(e.assetId)) e.assetId = null;

  return { entries, error: files.error?.message ?? null };
}
