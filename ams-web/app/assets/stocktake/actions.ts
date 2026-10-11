"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import { SEGMENTS, excludeRetired, isOneOf } from "@/lib/internal-equipment";
import { STOCKTAKE_RESULTS } from "@/lib/stocktake";

// Equipment stocktake (schema_step49.sql). Staff only; the tables hold
// internal equipment only, and the snapshot below is built from internal
// organizations, whatever the form says.

const LIST = "/assets/stocktake";

function text(value: FormDataEntryValue | null): string | null {
  const s = value === null ? "" : String(value).trim();
  return s === "" ? null : s;
}

export async function startStocktake(formData: FormData) {
  const profile = await requireStaff();
  const fail = (message: string) => redirect(`${LIST}?error=${encodeURIComponent(message)}`);

  const name = text(formData.get("name"));
  if (!name) return fail("Give the stocktake a name.");
  const segmentRaw = text(formData.get("segment"));
  if (segmentRaw !== null && !isOneOf(SEGMENTS, segmentRaw)) return fail("Segment is not a valid choice.");

  const supabase = await createClient();
  const orgIds = await getInternalOrgIds(supabase);
  if (orgIds.length === 0) return fail("No internal organization is set up.");

  // Active internal items only: retired / lost rows are not counted, the same
  // rule as "All" on /assets.
  let assetQuery = supabase
    .from("assets")
    .select("id, asset_tag, description, brand, model, custodian, department")
    .in("organization_id", orgIds)
    .order("asset_tag", { ascending: true });
  assetQuery = excludeRetired(assetQuery);
  if (segmentRaw) assetQuery = assetQuery.eq("segment", segmentRaw);
  const { data: assets, error: assetError } = await assetQuery;
  if (assetError) return fail(assetError.message);
  if (!assets || assets.length === 0) return fail("There is no equipment in that scope to count.");

  const { data: created, error: createError } = await supabase
    .from("equipment_stocktakes")
    .insert({ name, scope_segment: segmentRaw, created_by: profile.id })
    .select("id")
    .single();
  if (createError || !created) return fail(createError?.message ?? "Could not start the stocktake.");

  const { error: itemsError } = await supabase.from("equipment_stocktake_items").insert(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assets.map((a: any) => ({
      stocktake_id: created.id,
      asset_id: a.id,
      asset_tag: a.asset_tag,
      description: a.description || [a.brand, a.model].filter(Boolean).join(" ") || null,
      expected_custodian: a.custodian || null,
      expected_department: a.department || null,
    })),
  );
  if (itemsError) {
    // Do not leave an empty stocktake behind.
    await supabase.from("equipment_stocktakes").delete().eq("id", created.id);
    return fail(itemsError.message);
  }

  revalidatePath(LIST);
  redirect(`${LIST}/${created.id}`);
}

export async function recordCount(stocktakeId: string, itemId: string, formData: FormData) {
  const profile = await requireStaff();
  const supabase = await createClient();

  // Where to land afterwards: the same filtered view, at the same item.
  const back = String(formData.get("back") ?? "");
  const base = back.startsWith(`${LIST}/${stocktakeId}`) ? back.split("#")[0] : `${LIST}/${stocktakeId}`;
  const done = (error?: string) => {
    const url = new URL(base, "http://x");
    if (error) url.searchParams.set("error", error);
    else url.searchParams.delete("error");
    redirect(`${url.pathname}${url.search}#item-${itemId}`);
  };

  const { data: stocktake } = await supabase
    .from("equipment_stocktakes")
    .select("status")
    .eq("id", stocktakeId)
    .maybeSingle();
  if (!stocktake) return done("That stocktake no longer exists.");
  if (stocktake.status !== "open") return done("This stocktake is completed. Counts can no longer be changed.");

  const choice = String(formData.get("result") ?? "");
  let update: Record<string, unknown>;
  if (choice === "reset") {
    update = { result: null, actual_custodian: null, condition_note: null, checked_at: null, checked_by: null };
  } else if (STOCKTAKE_RESULTS.some((r) => r.value === choice)) {
    const actual = text(formData.get("actual_custodian"));
    if (choice === "different_holder" && !actual) {
      return done("Type who is actually holding it when choosing Different holder.");
    }
    update = {
      result: choice,
      actual_custodian: choice === "different_holder" ? actual : null,
      condition_note: text(formData.get("condition_note")),
      checked_at: new Date().toISOString(),
      checked_by: profile.id,
    };
  } else {
    return done("Choose Found, Missing or Different holder.");
  }

  const { error } = await supabase
    .from("equipment_stocktake_items")
    .update(update)
    .eq("id", itemId)
    .eq("stocktake_id", stocktakeId);
  if (error) return done(error.message);

  revalidatePath(`${LIST}/${stocktakeId}`);
  done();
}

export async function completeStocktake(stocktakeId: string) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_stocktakes")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", stocktakeId)
    .eq("status", "open");
  if (error) redirect(`${LIST}/${stocktakeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(LIST);
  redirect(`${LIST}/${stocktakeId}`);
}

export async function deleteStocktake(stocktakeId: string) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("equipment_stocktakes").delete().eq("id", stocktakeId);
  if (error) redirect(`${LIST}/${stocktakeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(LIST);
  redirect(LIST);
}
