"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/supabase/profile";
import { logError } from "@/lib/error-log";

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

// Deliberately triggers the real pipeline end-to-end — error_logs insert,
// alerts insert, notifyStaff() email/push — without needing to actually
// break something in production to verify it works. Same
// requireSuperAdmin() gate as everything else on this page; logError()
// itself never throws, so this action can't fail in a way that leaves
// the user stuck.
export async function triggerTestError() {
  await requireSuperAdmin();

  await logError(
    "test:manual",
    new Error(
      "This is a test error, manually triggered from the Error Logs page to verify the pipeline end-to-end. Safe to resolve/ignore.",
    ),
    { triggeredFrom: "/error-logs", triggeredAt: new Date().toISOString() },
  );

  revalidatePath("/error-logs");
  redirect("/error-logs?test=1");
}
