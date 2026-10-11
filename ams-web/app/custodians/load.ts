import { createClient } from "@/lib/supabase/server";
import { getInternalOrgIds } from "@/lib/internal-org";
import { excludeRetired } from "@/lib/internal-equipment";
import { custodianKey, type CustodyRow } from "@/lib/custodians";

// One person's active internal items, matched the same way the Custodians
// list groups them (trimmed, ignoring capital letters). Internal equipment
// only: the organization filter is applied here, not taken from the URL.
export async function loadCustodianItems(name: string): Promise<{
  rows: CustodyRow[];
  spelling: string;
  error: string | null;
}> {
  const supabase = await createClient();
  const orgIds = await getInternalOrgIds(supabase);
  if (orgIds.length === 0) return { rows: [], spelling: name, error: null };

  let query = supabase
    .from("assets")
    .select(
      "id, asset_tag, description, brand, model, asset_category, serial_number, department, segment, condition, assignment_status, date_issued, custodian",
    )
    .in("organization_id", orgIds)
    .not("custodian", "is", null)
    .order("asset_tag", { ascending: true });
  query = excludeRetired(query);
  const { data, error } = await query;

  const key = custodianKey(name);
  const rows = ((data ?? []) as CustodyRow[]).filter((r) => custodianKey(r.custodian) === key);

  // The most common spelling, so links into the Assets list match exactly.
  const counts = new Map<string, number>();
  for (const r of rows) {
    const s = (r.custodian ?? "").trim();
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const spelling = Array.from(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? name.trim();
  return { rows, spelling, error: error?.message ?? null };
}

/** Every active internal item that has a custodian, for the list and for spotting a merge. */
export async function loadAllHeld(supabase?: Awaited<ReturnType<typeof createClient>>): Promise<{
  rows: CustodyRow[];
  error: string | null;
}> {
  const client = supabase ?? (await createClient());
  const orgIds = await getInternalOrgIds(client);
  if (orgIds.length === 0) return { rows: [], error: null };
  let query = client
    .from("assets")
    .select(
      "id, asset_tag, description, brand, model, asset_category, serial_number, department, segment, condition, assignment_status, date_issued, custodian",
    )
    .in("organization_id", orgIds)
    .not("custodian", "is", null);
  query = excludeRetired(query);
  const { data, error } = await query;
  return { rows: (data ?? []) as CustodyRow[], error: error?.message ?? null };
}
