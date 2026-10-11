"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { sendWarrantyReminders } from "@/lib/warranty-reminders";

// "Send me a test" on the Warranty & Renewals tab: the same email the weekly
// job sends, to the signed-in person only, and sent even on a quiet week, so
// the email setup can be checked without waiting for Monday.
export async function sendTestWarrantyEmail() {
  await requireStaff();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const to = user?.email;
  if (!to) redirect(`/warranty?mail=${encodeURIComponent("Your account has no email address to send to.")}&mailOk=0`);

  let message: string;
  let ok = false;
  try {
    const result = await sendWarrantyReminders(to);
    if (result.sent > 0) {
      ok = true;
      message = `Test email sent to ${to}.`;
    } else {
      message = result.failures[0] ?? result.skipped ?? "The email was not sent.";
    }
  } catch (err) {
    message = err instanceof Error ? err.message : "The email was not sent.";
  }
  redirect(`/warranty?mail=${encodeURIComponent(message)}&mailOk=${ok ? "1" : "0"}`);
}
