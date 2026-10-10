import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/stocktake";
import type { CustodianProfile } from "@/lib/custodians";

type Client = Awaited<ReturnType<typeof createClient>>;

const COLUMNS = "name_key, name, job_title, email, phone, employee_no, status, notes";

/**
 * Details kept per person (schema_step51.sql). Before that step is run the
 * table is missing; that is not an error here, it just means no details yet,
 * and `ready` tells the page to say so.
 */
export async function loadCustodianProfiles(
  supabase: Client,
): Promise<{ byKey: Map<string, CustodianProfile>; ready: boolean }> {
  const { data, error } = await supabase.from("equipment_custodians").select(COLUMNS);
  if (error) return { byKey: new Map(), ready: !isMissingTableError(error) };
  const byKey = new Map<string, CustodianProfile>();
  for (const p of (data ?? []) as CustodianProfile[]) byKey.set(p.name_key, p);
  return { byKey, ready: true };
}
