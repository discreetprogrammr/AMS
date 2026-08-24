"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { makeAvatarPath, MAX_AVATAR_BYTES } from "@/lib/avatar";

// Client-invoked (throw-on-error), same reasoning as uploadDocument
// (app/assets/[id]/documents-actions.ts): a raw File can't be passed as a
// plain Server Action argument, so the caller wraps it in a FormData first.
// Uses the signed-in user's own session client throughout — never
// service-role — so RLS + schema_step38.sql's column-level GRANT are what
// actually enforce "only your own avatar_url, only your own storage
// folder", not this action's own logic.
export async function uploadAvatar(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You need to be signed in to do that.");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please choose an image.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Image is too large (max 5MB).");
  }

  // Fetch the current avatar_url first so the old Storage object can be
  // cleaned up after a successful replace — otherwise every re-upload
  // leaves an orphaned file behind in the user's own folder forever.
  const { data: existing } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();

  const path = makeAvatarPath(user.id, file.name);

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);
  if (updateError) {
    // Best-effort cleanup — don't leave an orphaned file in Storage with no
    // profile row pointing at it.
    await supabase.storage.from("avatars").remove([path]);
    throw new Error(updateError.message);
  }

  const oldPath = pathFromPublicUrl(existing?.avatar_url ?? null);
  if (oldPath) {
    await supabase.storage.from("avatars").remove([oldPath]);
  }

  // Refreshes every route under the app shell (sidebar renders on all of
  // them) — the caller also does a client-side router.refresh() for the
  // current page's own server components, but this covers the cached
  // versions of other pages too.
  revalidatePath("/", "layout");
}

export async function removeAvatar(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You need to be signed in to do that.");
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);
  if (error) {
    throw new Error(error.message);
  }

  const oldPath = pathFromPublicUrl(existing?.avatar_url ?? null);
  if (oldPath) {
    await supabase.storage.from("avatars").remove([oldPath]);
  }

  revalidatePath("/", "layout");
}

// avatar_url stores the full public URL (not just the storage path) so
// every render site can use it directly as an <img src> without knowing
// the bucket name — this pulls the {userId}/{random}-{filename} path back
// out of it for cleanup, since the Storage remove() API needs the path, not
// the URL.
function pathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = "/avatars/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}
