import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import {
  SEGMENTS,
  applyInternalFilters,
  internalAssetsHref,
  labelFor,
  manilaDate,
  parseInternalFilters,
} from "@/lib/internal-equipment";
import { generateQrDataUrl } from "@/lib/qr";
import { PrintButton } from "@/components/print-button";

// Printable QR labels for internal equipment: one label per asset on /assets
// (same filters and search as the list, so "print what is on screen"), or a
// single label with ?id=. Each QR is the asset's own page URL, so a phone
// camera opens the item once signed in. Internal organizations only, always,
// whatever is in the URL.
//
// Standalone and always white, like the printable service report
// (app/reports/service-record/[id]/page.tsx): a dark theme does not print.
const MAX_LABELS = 300;

export default async function AssetLabelsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined> & { q?: string; id?: string };
}) {
  await requireStaff();
  const supabase = await createClient();
  const internalOrgIds = await getInternalOrgIds(supabase);

  const filters = parseInternalFilters(searchParams);
  const q = (typeof searchParams.q === "string" ? searchParams.q : "").trim().replace(/,/g, "");
  const singleId = typeof searchParams.id === "string" ? searchParams.id : "";

  let rows: {
    id: string;
    asset_tag: string;
    description: string | null;
    brand: string | null;
    model: string | null;
    segment: string | null;
  }[] = [];
  let loadError: string | null = null;

  if (internalOrgIds.length > 0) {
    let query = supabase
      .from("assets")
      .select("id, asset_tag, description, brand, model, segment")
      .in("organization_id", internalOrgIds)
      .order("asset_tag", { ascending: true })
      .limit(MAX_LABELS + 1);
    if (singleId) {
      query = query.eq("id", singleId);
    } else {
      query = applyInternalFilters(query, filters, manilaDate());
      if (q) {
        query = query.or(
          `asset_tag.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,serial_number.ilike.%${q}%,description.ilike.%${q}%,custodian.ilike.%${q}%`,
        );
      }
    }
    const { data, error } = await query;
    rows = data ?? [];
    loadError = error?.message ?? null;
  }

  const truncated = rows.length > MAX_LABELS;
  rows = rows.slice(0, MAX_LABELS);

  // Same host logic as the asset page: works on localhost, previews and the
  // real domain with nothing to configure.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const labels = await Promise.all(
    rows.map(async (r) => ({ ...r, qr: await generateQrDataUrl(`${proto}://${host}/assets/${r.id}`) })),
  );

  const backHref = internalAssetsHref({ q, org: internalOrgIds[0] ?? "" }, filters);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          @page { margin: 10mm; }
        }
      `}</style>

      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
        <div>
          <Link
            href={singleId ? `/assets/${singleId}` : backHref}
            className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
          >
            ← Back
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            {labels.length} label{labels.length === 1 ? "" : "s"}
            {singleId ? "" : " for the current filters"}. In the print dialog, turn off headers and footers and
            set scale to 100%.
          </p>
        </div>
        {labels.length > 0 && <PrintButton label="Print labels" />}
      </div>

      {loadError && (
        <p className="print:hidden m-6 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}
      {truncated && (
        <p className="print:hidden m-6 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only the first {MAX_LABELS} labels are shown. Narrow the filters to print the rest.
        </p>
      )}
      {labels.length === 0 && !loadError && (
        <p className="print:hidden m-6 text-sm text-slate-500">No equipment matches these filters.</p>
      )}

      <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3 print:grid-cols-3 print:gap-2 print:p-0">
        {labels.map((l) => (
          <div
            key={l.id}
            className="flex break-inside-avoid items-center gap-3 rounded border border-slate-300 p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.qr} alt={`QR code for ${l.asset_tag}`} className="h-24 w-24 shrink-0" />
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold tracking-tight">{l.asset_tag}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-700">
                {l.description || [l.brand, l.model].filter(Boolean).join(" ") || "—"}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                {labelFor(SEGMENTS, l.segment)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
