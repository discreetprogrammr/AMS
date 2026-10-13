"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import { custodianKey } from "@/lib/custodians";
import { isMissingTableError } from "@/lib/stocktake";
import { loadCustodianNames } from "./custodian-names";

export type AddCustodianResult = { ok: true; name: string } | { ok: false; error: string };

// Adds a person to the internal Custodian list (the Custodians tab's
// equipment_custodians table, schema_step51.sql) so the asset form can
// select them straight away. A name that already exists in any capitalisation
// or spacing is not an error: the existing spelling comes back, ready to select.
export async function addInternalCustodian(rawName: string): Promise<AddCustodianResult> {
  await requireStaff();

  const name = String(rawName ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Type the person's name." };
  if (name.length > 100) return { ok: false, error: "A name can be at most 100 characters." };

  const supabase = await createClient();
  const key = custodianKey(name);

  const { data: profile, error: lookupError } = await supabase
    .from("equipment_custodians")
    .select("name, status")
    .eq("name_key", key)
    .maybeSingle();
  if (lookupError) {
    return {
      ok: false,
      error: isMissingTableError(lookupError)
        ? "The custodian list is not set up yet. Run schema_step51.sql in the Supabase SQL editor."
        : lookupError.message,
    };
  }
  if (profile) {
    if (profile.status === "left") {
      return { ok: false, error: `${profile.name} is marked as having left. Reactivate them on the Custodians tab first.` };
    }
    return { ok: true, name: profile.name };
  }

  // Someone who only exists as a name typed on an item (no profile yet).
  const known = await loadCustodianNames(supabase, await getInternalOrgIds(supabase));
  const match = known.find((n) => custodianKey(n) === key);
  if (match) return { ok: true, name: match };

  const { error } = await supabase.from("equipment_custodians").insert({ name_key: key, name });
  if (error) {
    // Lost a race with another save of the same name: use the winner.
    if (error.code === "23505") return { ok: true, name };
    return { ok: false, error: error.message };
  }
  revalidatePath("/custodians");
  return { ok: true, name };
}
