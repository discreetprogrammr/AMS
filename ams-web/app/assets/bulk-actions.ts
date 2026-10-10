"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  deriveInternalStatus,
  isOneOf,
} from "@/lib/internal-equipment";

// Bulk edit for the internal equipment list: set the custodian, department,
// status or condition of several selected items at once (for example when
// a department moves or a batch is handed out). Internal equipment only,
// checked here against the database and not taken from the form. Each
// item's operating status is re-derived from its resulting condition and
// assignment status, exactly as a single edit does (deriveInternalStatus).
// The custodian-history trigger (schema_step48.sql) logs every custodian
// change made this way.

const MAX_ITEMS = 200;

function text(value: FormDataEntryValue | null): string | null {
  const s = value === null ? "" : String(value).trim();
  return s === "" ? null : s;
}

export async function bulkUpdateInternalAssets(formData: FormData) {
  await requireStaff();

  const requested = String(formData.get("back") ?? "");
  const back = requested.startsWith("/assets") && !requested.startsWith("//") ? requested : "/assets";
  const withMessage = (key: "error" | "bulk", message: string) => {
    const url = new URL(back, "http://x");
    url.searchParams.delete("error");
    url.searchParams.delete("bulk");
    url.searchParams.set(key, message);
    redirect(`${url.pathname}${url.search}`);
  };

  const ids = Array.from(new Set(formData.getAll("ids").map(String).filter(Boolean)));
  if (ids.length === 0) return withMessage("error", "Select at least one item first.");
  if (ids.length > MAX_ITEMS) return withMessage("error", `Select ${MAX_ITEMS} items or fewer at a time.`);

  // What to change. A field left blank is left alone; "clear" empties it.
  const changes: Record<string, string | null> = {};
  if (formData.get("clear_custodian") === "on") changes.custodian = null;
  else if (text(formData.get("custodian"))) changes.custodian = text(formData.get("custodian"));
  if (formData.get("clear_department") === "on") changes.department = null;
  else if (text(formData.get("department"))) changes.department = text(formData.get("department"));

  const assignment = text(formData.get("assignment_status"));
  if (assignment !== null) {
    if (!isOneOf(ASSIGNMENT_STATUSES, assignment)) return withMessage("error", "Status is not a valid choice.");
    changes.assignment_status = assignment;
  }
  const condition = text(formData.get("condition"));
  if (condition !== null) {
    if (!isOneOf(CONDITIONS, condition)) return withMessage("error", "Condition is not a valid choice.");
    changes.condition = condition;
  }
  if (Object.keys(changes).length === 0) return withMessage("error", "Choose at least one thing to change.");

  const supabase = await createClient();
  const orgIds = await getInternalOrgIds(supabase);
  if (orgIds.length === 0) return withMessage("error", "No internal organization is set up.");

  // Only internal items, whatever ids arrive. Any id that is not one is a
  // refusal, not a quiet skip.
  const { data: found, error: findError } = await supabase
    .from("assets")
    .select("id, condition, assignment_status")
    .in("id", ids)
    .in("organization_id", orgIds);
  if (findError) return withMessage("error", findError.message);
  if (!found || found.length !== ids.length) {
    return withMessage("error", "Some selected items are not internal equipment or no longer exist. Nothing was changed.");
  }

  // Group items that end up with the same patch, so a department move is one
  // update and not one per row. Status depends on each item's own resulting
  // condition and assignment, so it can split a group.
  const groups = new Map<string, { ids: string[]; patch: Record<string, string | null> }>();
  const touchesStatus = "assignment_status" in changes || "condition" in changes;
  for (const row of found) {
    const patch: Record<string, string | null> = { ...changes };
    if (touchesStatus) {
      patch.status = deriveInternalStatus(
        (changes.condition as string | undefined) ?? row.condition,
        (changes.assignment_status as string | undefined) ?? row.assignment_status,
      );
    }
    const key = JSON.stringify(patch);
    const group = groups.get(key) ?? { ids: [], patch };
    group.ids.push(row.id);
    groups.set(key, group);
  }

  const now = new Date().toISOString();
  const results = await Promise.all(
    Array.from(groups.values()).map((g) =>
      supabase
        .from("assets")
        // updated_at has no trigger on assets; the equipment dashboard reads it.
        .update({ ...g.patch, updated_at: now })
        .in("id", g.ids),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return withMessage("error", `Some items may not have been updated: ${failed.error.message}`);
  }

  revalidatePath("/assets");
  return withMessage("bulk", `Updated ${found.length} item${found.length === 1 ? "" : "s"}.`);
}
