import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reportRef } from "@/lib/format";
import { reportKindOf, REPORT_KIND_REF_PREFIX } from "@/lib/report-types";

// Streams the stored PDF (schema_step20.sql / lib/pdf/generate-and-store.ts)
// back as a real file download. Falls back to the live-rendered report
// page instead of a dead 404 if no PDF has been stored yet — covers
// reports created before this feature shipped, or ones where generation
// failed at submit time (the report itself always saves regardless).
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();

  const { data: record } = await supabase
    .from("service_records")
    .select("id, service_type, report_url")
    .eq("id", params.id)
    .single();

  if (!record) {
    return new NextResponse("Report not found.", { status: 404 });
  }

  if (!record.report_url) {
    return NextResponse.redirect(
      new URL(`/reports/service-record/${params.id}`, request.url),
    );
  }

  const { data: file, error } = await supabase.storage
    .from("service-reports")
    .download(record.report_url);

  if (error || !file) {
    return NextResponse.redirect(
      new URL(`/reports/service-record/${params.id}`, request.url),
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = reportKindOf(record.service_type);
  const filename = `${reportRef(record.id, REPORT_KIND_REF_PREFIX[kind])}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
