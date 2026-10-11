import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { isInlineImage } from "@/lib/documents";

// Streams a stored asset document back as a real file download. Uses the
// signed-in user's own session (not service-role) for both the catalog
// lookup and the Storage download, so RLS (schema_step35.sql) is the real
// gate — a client hitting this for a document outside their own org just
// gets a 404 from the first query, same as every other RLS-scoped lookup
// in this app. Mirrors app/api/reports/service-records/[id]/pdf/route.ts.
// A header value must be plain ASCII without quotes or line breaks, but file
// names are whatever the uploader's computer called the file ("page.com%2F
// (1).png", names with accents or emoji). Send an ASCII fallback plus the
// real name in the RFC 5987 form; browsers prefer the latter.
function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("asset_documents")
    .select("asset_id, file_name, file_path, mime_type")
    .eq("id", params.id)
    .single();

  if (!doc) {
    return new NextResponse("Document not found.", { status: 404 });
  }

  // HR & Admin preset: only documents of internal equipment (photos,
  // receipts, warranty cards). A client asset's document looks like it does
  // not exist.
  const profile = await getProfile();
  if (profile && isHrAdminPreset(profile.hidden_modules)) {
    const [{ data: asset }, internalOrgIds] = await Promise.all([
      supabase.from("assets").select("organization_id").eq("id", doc.asset_id).maybeSingle(),
      getInternalOrgIds(supabase),
    ]);
    if (!asset || !internalOrgIds.includes(asset.organization_id)) {
      return new NextResponse("Document not found.", { status: 404 });
    }
  }

  const { data: file, error } = await supabase.storage
    .from("asset-documents")
    .download(doc.file_path);

  if (error || !file) {
    return new NextResponse("Couldn't retrieve the file.", { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ?inline=1 shows a photo in the page (thumbnails). Only for safe image
  // types; everything else, and every plain request, stays a download.
  const inline = new URL(request.url).searchParams.get("inline") === "1" && isInlineImage(doc.mime_type);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", doc.file_name),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
