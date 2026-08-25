"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/profile";

// Super Admin-only, same precedent as Audit Log (app/audit-log) — this is
// raw technical detail (stack traces, request context), not an everyday
// ops surface the way /alerts already is for every other staff member.
// Every error still shows up in /alerts too (lib/error-log.ts inserts
// both rows), so day-to-day staff aren't missing anything by not having
// access here.
export async function resolveErrorLog(id: string) {
  await requireSuperAdmin();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("error_logs")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id ?? null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/error-logs");
}
