import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Streams a stored asset document back as a real file download. Uses the
// signed-in user's own session (not service-role) for both the catalog
// lookup and the Storage download, so RLS (schema_step35.sql) is the real
// gate — a client hitting this for a document outside their own org just
// gets a 404 from the first query, same as every other RLS-scoped lookup
// in this app. Mirrors app/api/reports/service-records/[id]/pdf/route.ts.
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("asset_documents")
    .select("file_name, file_path, mime_type")
    .eq("id", params.id)
    .single();

  if (!doc) {
    return new NextResponse("Document not found.", { status: 404 });
  }

  const { data: file, error } = await supabase.storage
    .from("asset-documents")
    .download(doc.file_path);

  if (error || !file) {
    return new NextResponse("Couldn't retrieve the file.", { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${doc.file_name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
