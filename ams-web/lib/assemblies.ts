import type { SupabaseClient } from "@supabase/supabase-js";

// An "assembly" is an internal asset that other assets point to as their
// parent (assets.parent_asset_id, schema_step46.sql): for example the
// Desktop PC record that its ten parts belong to. The parts are the real
// items (own tag, serial, cost, warranty); the assembly is only the record
// that groups them. It is shown in the list, labelled "Assembly", but it is
// left out of every total and of stocktakes, so the figures match HR's own
// spreadsheet, which has only the parts.
//
// Assemblies are not flagged by a column: an asset is one while something
// points to it, so nothing can fall out of step.

/** Ids of the internal assets that have at least one part. */
export async function loadAssemblyIds(supabase: SupabaseClient, orgIds: string[]): Promise<Set<string>> {
  if (orgIds.length === 0) return new Set();
  const { data } = await supabase
    .from("assets")
    .select("parent_asset_id")
    .in("organization_id", orgIds)
    .not("parent_asset_id", "is", null);
  return new Set(
    (data ?? [])
      .map((r: { parent_asset_id: string | null }) => r.parent_asset_id)
      .filter((id): id is string => !!id),
  );
}

/** Drops assemblies from a list of rows that have an `id`. */
export function withoutAssemblies<T extends { id: string }>(rows: T[], assemblyIds: Set<string>): T[] {
  return assemblyIds.size === 0 ? rows : rows.filter((r) => !assemblyIds.has(r.id));
}
