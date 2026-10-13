"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { INTERNAL_DEPARTMENTS } from "@/lib/internal-equipment";
import { requireStaff } from "@/lib/supabase/profile";
import { custodianKey } from "@/lib/custodians";
import { isMissingTableError } from "@/lib/stocktake";

// Edit a custodian's details (schema_step51.sql): rename them on every item
// they hold and in their custodian history (rename_custodian, one
// transaction, merging with an existing person if the name already exists),
// optionally set the department on those items, and keep the per-person
// details (job title, email, phone, employee number, status, notes).
// Staff only; the database function only touches internal equipment.

function text(value: FormDataEntryValue | null, max: number): string | null {
  const s = value === null ? "" : String(value).trim();
  return s === "" ? null : s.slice(0, max);
}

const SETUP_HINT = "Custodian details are not set up yet. Run schema_step51.sql in the Supabase SQL editor.";

export async function saveCustodian(originalName: string, formData: FormData) {
  await requireStaff();

  const here = (params: Record<string, string>, name = originalName) => {
    const q = new URLSearchParams({ name, ...params });
    return `/custodians/view?${q.toString()}`;
  };
  const fail = (message: string) => redirect(here({ error: message }));

  const name = text(formData.get("name"), 120);
  if (!name) return fail("A name is required.");
  const department = text(formData.get("department"), 120);
  if (department && !(INTERNAL_DEPARTMENTS as readonly string[]).includes(department)) {
    return fail("Department must be one of the choices in the list.");
  }
  const email = text(formData.get("email"), 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address does not look right.");
  const status = String(formData.get("status") ?? "active");
  if (status !== "active" && status !== "left") return fail("Status is not a valid choice.");

  const supabase = await createClient();

  // Rename / department go through the database function, so the items and
  // their history change together or not at all.
  const renaming = name !== originalName.trim();
  let touched = "";
  if (renaming || department) {
    const { data, error } = await supabase.rpc("rename_custodian", {
      p_old: originalName,
      p_new: name,
      p_department: department,
    });
    if (error) {
      return fail(
        isMissingTableError(error) || /could not find the function|rename_custodian/i.test(error.message)
          ? SETUP_HINT
          : `Could not update the items: ${error.message}`,
      );
    }
    const result = data as { assets?: number; history?: number } | null;
    touched = ` Updated ${result?.assets ?? 0} item${result?.assets === 1 ? "" : "s"}.`;
  }

  const { error: profileError } = await supabase.from("equipment_custodians").upsert(
    {
      name_key: custodianKey(name),
      name,
      job_title: text(formData.get("job_title"), 120),
      email,
      phone: text(formData.get("phone"), 60),
      employee_no: text(formData.get("employee_no"), 60),
      status,
      notes: text(formData.get("notes"), 1000),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "name_key" },
  );
  if (profileError) {
    return redirect(
      here(
        { error: isMissingTableError(profileError) ? SETUP_HINT : `Could not save the details: ${profileError.message}` },
        name,
      ),
    );
  }

  revalidatePath("/custodians");
  revalidatePath("/assets");
  redirect(here({ saved: `Saved.${touched}` }, name));
}
