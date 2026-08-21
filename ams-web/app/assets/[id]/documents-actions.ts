"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { makeDocumentPath, MAX_DOCUMENT_BYTES } from "@/lib/documents";

// Staff-only. Client-invoked (throw-on-error) rather than a plain <form
// action> — this is called from upload-document-modal.tsx, which needs to
// keep the already-selected file and show an inline error on failure
// instead of losing it to a redirect round trip, same reasoning as
// receiveStock (app/parts/actions.ts).
//
// Takes a FormData rather than a raw File positional argument — passing a
// bare File instance alongside other plain args isn't reliably supported
// by Server Actions' serialization ("Only plain objects, and a few
// built-ins, can be passed to Server Actions"). FormData itself IS a
// supported boundary type (it's exactly what a native <form action> submit
// already sends under the hood), so wrapping the file in one sidesteps it.
export async function uploadDocument(assetId: string, formData: FormData): Promise<void> {
  await requireStaff(`/assets/${assetId}`);

  const file = formData.get("file");
  const category = String(formData.get("category") ?? "other");
  const title = String(formData.get("title") ?? "");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please choose a file.");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("File is too large (max 25MB).");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = makeDocumentPath(assetId, file.name);

  const { error: uploadError } = await supabase.storage
    .from("asset-documents")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: insertError } = await supabase.from("asset_documents").insert({
    asset_id: assetId,
    category,
    title: title.trim() || file.name,
    file_name: file.name,
    file_path: path,
    mime_type: file.type || null,
    file_size: file.size,
    uploaded_by: user?.id ?? null,
  });
  if (insertError) {
    // Best-effort cleanup — don't leave an orphaned file in Storage with no
    // catalog row pointing at it.
    await supabase.storage.from("asset-documents").remove([path]);
    throw new Error(insertError.message);
  }

  revalidatePath(`/assets/${assetId}`);
}

// Staff-only. Plain <form action> (bound with assetId/documentId), matching
// the other small per-row staff actions already on this page
// (acknowledgeTicket, resolveTicket, etc. in ../tickets-actions.ts) —
// redirect-on-error rather than throw, since there's no client-side catch
// wrapping this one.
export async function deleteDocument(assetId: string, documentId: string) {
  await requireStaff(`/assets/${assetId}`);

  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("asset_documents")
    .select("file_path")
    .eq("id", documentId)
    .single();

  const { error } = await supabase.from("asset_documents").delete().eq("id", documentId);
  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  if (doc?.file_path) {
    await supabase.storage.from("asset-documents").remove([doc.file_path]);
  }

  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}`);
}
