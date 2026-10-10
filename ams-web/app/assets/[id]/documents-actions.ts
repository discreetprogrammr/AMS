"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import {
  DOCUMENT_CATEGORIES,
  INTERNAL_DOCUMENT_CATEGORIES,
  makeDocumentPath,
  displayFileName,
  MAX_UPLOAD_BYTES,
} from "@/lib/documents";
import { logError } from "@/lib/error-log";
import { getInternalOrgIds } from "@/lib/internal-org";
import { denyHrAdminPresetUnlessInternalAsset } from "@/lib/hr-admin-guard";

export type UploadResult = { ok: true } | { ok: false; error: string };

// Turns what Supabase says into a sentence a person can act on. In
// production Next.js replaces the message of any error THROWN from a Server
// Action with "An error occurred in the Server Components render...", so
// this action never throws for an expected failure: it returns { ok: false,
// error } and the dialog shows the text.
function uploadErrorMessage(error: { code?: string; message?: string; statusCode?: string | number }): string {
  const message = error.message ?? "";
  if (error.code === "23514" || /asset_documents_category_check/.test(message)) {
    return "The database does not accept this category yet. Run schema_step50.sql in the Supabase SQL editor, then try again.";
  }
  if (/bucket not found/i.test(message)) {
    return "The asset-documents storage bucket does not exist. Run schema_step35.sql in the Supabase SQL editor.";
  }
  if (/row-level security|not authorized|unauthorized|permission denied/i.test(message) || error.statusCode === "403" || error.statusCode === 403) {
    return "You do not have permission to add files to this asset.";
  }
  if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(message) || error.statusCode === "413" || error.statusCode === 413) {
    return "That file is too large for storage. Try a smaller file (up to 4 MB).";
  }
  return message ? `Could not save the file: ${message}` : "Could not save the file.";
}

// Staff-only. Client-invoked rather than a plain <form action> — this is
// called from upload-document-modal.tsx, which needs to keep the already-
// selected file and show an inline error on failure instead of losing it to
// a redirect round trip, same reasoning as receiveStock
// (app/parts/actions.ts).
//
// Takes a FormData rather than a raw File positional argument — passing a
// bare File instance alongside other plain args isn't reliably supported
// by Server Actions' serialization ("Only plain objects, and a few
// built-ins, can be passed to Server Actions"). FormData itself IS a
// supported boundary type (it's exactly what a native <form action> submit
// already sends under the hood), so wrapping the file in one sidesteps it.
export async function uploadDocument(assetId: string, formData: FormData): Promise<UploadResult> {
  // These two redirect (which works by throwing), so they stay outside the
  // try block below.
  // HR & Admin preset: internal equipment only (photos, receipts, warranty).
  await denyHrAdminPresetUnlessInternalAsset(assetId);
  await requireStaff(`/assets/${assetId}`);

  try {
    const file = formData.get("file");
    const category = String(formData.get("category") ?? "other");
    const rawTitle = String(formData.get("title") ?? "").trim();

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Please choose a file." };
    }
    // 4 MB: Server Actions are capped at 4mb in next.config.mjs, and Vercel
    // itself caps a request body at 4.5 MB.
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: "That file is over 4 MB. Photos are shrunk automatically; compress a large PDF first." };
    }

    const supabase = await createClient();

    // Which categories are on offer depends on the asset: internal equipment
    // has its own list (schema_step50.sql). The server decides, not the form.
    const { data: asset } = await supabase.from("assets").select("organization_id").eq("id", assetId).maybeSingle();
    if (!asset) return { ok: false, error: "That asset no longer exists." };
    const internalOrgIds = await getInternalOrgIds(supabase);
    const allowed = internalOrgIds.includes(asset.organization_id)
      ? INTERNAL_DOCUMENT_CATEGORIES
      : DOCUMENT_CATEGORIES;
    if (!allowed.some((c) => c.value === category)) {
      return { ok: false, error: "That category is not available for this asset." };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const shownName = displayFileName(file.name);
    // The storage key is a generated id plus the extension; the name the
    // person sees lives in file_name / title.
    const path = makeDocumentPath(assetId, file.name);

    const { error: uploadError } = await supabase.storage
      .from("asset-documents")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (uploadError) {
      await logError("asset-documents:upload", uploadError, { assetId, path, size: file.size, type: file.type });
      return { ok: false, error: uploadErrorMessage(uploadError) };
    }

    const { error: insertError } = await supabase.from("asset_documents").insert({
      asset_id: assetId,
      category,
      title: rawTitle || shownName,
      file_name: shownName,
      file_path: path,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: user?.id ?? null,
    });
    if (insertError) {
      // Best-effort cleanup — don't leave an orphaned file in Storage with no
      // catalog row pointing at it.
      await supabase.storage.from("asset-documents").remove([path]);
      // A category the database does not know yet is a setup step, not a bug
      // worth an alert; anything else is logged.
      if (insertError.code !== "23514") {
        await logError("asset-documents:insert", insertError, { assetId, category });
      }
      return { ok: false, error: uploadErrorMessage(insertError) };
    }

    revalidatePath(`/assets/${assetId}`);
    return { ok: true };
  } catch (err) {
    await logError("asset-documents:upload", err, { assetId });
    return { ok: false, error: `Could not save the file: ${err instanceof Error ? err.message : "unexpected error"}` };
  }
}

// Staff-only. Plain <form action> (bound with assetId/documentId), matching
// the other small per-row staff actions already on this page
// (acknowledgeTicket, resolveTicket, etc. in ../tickets-actions.ts) —
// redirect-on-error rather than throw, since there's no client-side catch
// wrapping this one.
export async function deleteDocument(assetId: string, documentId: string) {
  await denyHrAdminPresetUnlessInternalAsset(assetId);
  await requireStaff(`/assets/${assetId}`);

  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("asset_documents")
    .select("file_path")
    .eq("id", documentId)
    .eq("asset_id", assetId)
    .single();

  // asset_id as well as id, so a document can only be removed through the
  // asset it belongs to (the internal-asset check above is on assetId).
  const { error } = await supabase.from("asset_documents").delete().eq("id", documentId).eq("asset_id", assetId);
  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  if (doc?.file_path) {
    await supabase.storage.from("asset-documents").remove([doc.file_path]);
  }

  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}`);
}
