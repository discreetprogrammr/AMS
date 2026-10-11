import type { SupabaseClient } from "@supabase/supabase-js";
import { custodianKey } from "@/lib/custodians";

// The names offered in the Custodian drop-down on the internal asset form:
// everyone who holds, or has held, internal equipment, plus the people with a
// profile on the Custodians tab (schema_step51.sql, if it has been run).
// Spellings that differ only by capitals or spacing are one person, shown the
// way most items spell it. People marked as having left the company are not
// offered for new assignments, except the one this item already has.
export async function loadCustodianNames(
  supabase: SupabaseClient,
  orgIds: string[],
  current?: string | null,
): Promise<string[]> {
  if (orgIds.length === 0) return [];

  const spellings = new Map<string, Map<string, number>>();
  const add = (name: string | null | undefined) => {
    const s = (name ?? "").trim();
    const key = custodianKey(s);
    if (!key) return;
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(s, (counts.get(s) ?? 0) + 1);
    spellings.set(key, counts);
  };

  const { data: held } = await supabase
    .from("assets")
    .select("custodian")
    .in("organization_id", orgIds)
    .not("custodian", "is", null);
  for (const r of held ?? []) add((r as { custodian: string | null }).custodian);

  // Profiles are optional: before step 51 the table is missing and the query
  // simply returns an error, which means "no extra names".
  const left = new Set<string>();
  const { data: profiles } = await supabase.from("equipment_custodians").select("name, status");
  for (const p of (profiles ?? []) as { name: string; status: string }[]) {
    add(p.name);
    if (p.status === "left") left.add(custodianKey(p.name));
  }

  const keepKey = custodianKey(current);
  const names: string[] = [];
  for (const [key, counts] of spellings) {
    if (left.has(key) && key !== keepKey) continue;
    names.push(Array.from(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  }
  return names.sort((a, b) => a.localeCompare(b));
}
