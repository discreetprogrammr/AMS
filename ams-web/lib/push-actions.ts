"use server";

import { createClient } from "@/lib/supabase/server";

// Called from components/push-subscribe-button.tsx right after the browser
// hands back a PushSubscription from pushManager.subscribe(). Upsert on the
// unique `endpoint` (schema_step36.sql) — the same browser/device
// resubscribing (e.g. after clearing permission and re-granting it) just
// updates its row rather than erroring on the unique constraint or piling
// up duplicates.
export async function subscribeToPush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You need to be signed in to enable notifications.");
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

// Called when the user explicitly turns notifications back off from the
// same button, and mirrored by the service worker/browser itself in some
// cases (e.g. permission revoked) — either way, RLS ("manage own push
// subscriptions") already prevents removing anyone else's, so no extra
// user_id check is needed here beyond what the policy already enforces.
export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (error) {
    throw new Error(error.message);
  }
}
