import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { changedFields } from "@/lib/audit";
import { woRef, dateTimeLabel } from "@/lib/format";
import { generateQrDataUrl } from "@/lib/qr";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { AssetForm } from "../asset-form";
import { updateAsset } from "../actions";
import {
  createTicket,
  resolveTicket,
  acknowledgeTicket,
  markTicketPartsPending,
} from "../tickets-actions";

const EQUIPMENT_LABEL: Record<string, string> = {
  xray_screening: "X-ray Screening",
  people_threat_screening: "People / Threat Screening",
  water_generation: "Water Generation",
  pump: "Pump",
  other: "Other",
};

export default async function EditAssetPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; ticket?: string; workorder?: string };
}) {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);

  const [
    { data: asset },
    { data: organizations },
    { data: tickets },
    { data: certificates },
    { data: history },
  ] = await Promise.all([
    // Joins the site's address in directly — the Site field on the form is
    // now free text (see asset-form.tsx / resolveSiteId in actions.ts), so
    // this needs the address string to pre-fill it, not just the raw
    // site_id foreign key.
    supabase
      .from("assets")
      .select("*, sites(address), organizations(name)")
      .eq("id", params.id)
      .single(),
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("service_tickets")
      .select("id, description, status, priority, created_at, resolved_at, work_order_id")
      .eq("asset_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("compliance_certificates")
      .select("id, certificate_type, issue_date, expiry_date")
      .eq("asset_id", params.id)
      .order("expiry_date", { ascending: true }),
    // RLS restricts this to staff only — a client_viewer's query just
    // comes back empty, no error, so it's safe to always run this.
    supabase
      .from("audit_log")
      .select("id, action, changed_at, old_data, new_data, profiles(full_name)")
      .eq("table_name", "assets")
      .eq("record_id", params.id)
      .order("changed_at", { ascending: false }),
  ]);

  if (!asset) notFound();

  const boundUpdate = updateAsset.bind(null, params.id);
  const boundCreateTicket = createTicket.bind(null, params.id);

  // Header used to read "Asset Details — XRY-0010" (the internal asset
  // tag) — replaced with who/where instead, since that's what's actually
  // meaningful to a client looking at their own equipment. Falls back to
  // the asset tag only if somehow neither a client nor a site is on file,
  // so the title never comes back blank.
  const clientLabel = asset.organizations?.name ?? null;
  const siteLabel = asset.sites?.address ?? null;
  const titleSuffix =
    clientLabel && siteLabel
      ? `${clientLabel} — ${siteLabel}`
      : clientLabel ?? siteLabel ?? asset.asset_tag;

  // Reads the actual request's own host instead of a hardcoded/env-configured
  // domain — works correctly whether this is localhost, a Vercel preview
  // URL, or the real production custom domain, with nothing to misconfigure
  // or let go stale. Staff-only: printing a physical tag and jumping into a
  // checklist are field-technician actions, not something a client needs.
  let qrDataUrl: string | null = null;
  let assetUrl: string | null = null;
  if (isStaff) {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    assetUrl = `${proto}://${host}/assets/${asset.id}`;
    qrDataUrl = await generateQrDataUrl(assetUrl);
  }

  return (
    <AppShell
      profile={profile}
      title={`${isStaff ? "Edit Asset" : "Asset Details"} — ${titleSuffix}`}
      actions={
        <Link
          href="/assets"
          className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
        >
          ← Back to Assets
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        {searchParams?.ticket === "submitted" && (
          <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Service request submitted.
          </p>
        )}
        {searchParams?.workorder === "created" && (
          <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Work order created and linked to the ticket.
          </p>
        )}

        {isStaff && qrDataUrl && (
          <div className="mb-6 flex flex-col items-start gap-4 rounded-xl border border-hairline bg-surface p-6 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt={`QR code for ${asset.asset_tag}`}
              className="h-28 w-28 shrink-0 rounded-lg border border-hairline bg-white p-1.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Scan tag for this asset</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Print this onto a physical tag — scanning it (with the app's Scan Asset
                page, or any phone camera) jumps straight here instead of a manual search.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={qrDataUrl}
                  download={`${asset.asset_tag}-qr.png`}
                  className="text-xs font-medium text-blue-400 hover:underline"
                >
                  Download QR →
                </a>
                <Link
                  href={`/reports/preventive-checklist?asset_id=${asset.id}`}
                  className="text-xs font-medium text-blue-400 hover:underline"
                >
                  Start PM Checklist →
                </Link>
                <Link
                  href={`/reports/corrective-checklist?asset_id=${asset.id}`}
                  className="text-xs font-medium text-blue-400 hover:underline"
                >
                  Start CM Report →
                </Link>
              </div>
            </div>
          </div>
        )}

        {isStaff ? (
          <AssetForm
            organizations={organizations ?? []}
            action={boundUpdate}
            defaultValues={{
              ...asset,
              site_address: asset.sites?.address ?? "",
            }}
            submitLabel="Update Asset"
          />
        ) : (
          <AssetDetailReadOnly asset={asset} />
        )}

        <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Compliance Certificates
          </h2>
          {certificates?.length ? (
            <ul className="divide-y divide-hairline text-sm">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {certificates.map((c: any) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-ink-soft">{c.certificate_type}</span>
                  <span className="text-slate-500">
                    Expires {c.expiry_date ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No certificates on file yet.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Service Tickets
          </h2>
          {tickets?.length ? (
            <ul className="mb-4 divide-y divide-hairline text-sm">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {tickets.map((t: any) => (
                <li key={t.id} className="py-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <StatusBadge status={t.status} />
                      <StatusBadge status={t.priority} />
                    </span>
                    <span className="text-xs text-slate-500">
                      Raised {dateTimeLabel(t.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-ink-soft">{t.description}</p>
                  {t.resolved_at && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Resolved {dateTimeLabel(t.resolved_at)}
                    </p>
                  )}
                  <div className="mt-1">
                    <Link
                      href={`/messages/${t.id}`}
                      className="text-xs text-blue-400 hover:underline"
                    >
                      Message about this ticket →
                    </Link>
                  </div>
                  {isStaff && (
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {t.status === "open" && (
                        <form
                          action={acknowledgeTicket.bind(null, params.id, t.id)}
                        >
                          <button
                            type="submit"
                            className="text-xs text-slate-500 underline hover:text-ink-soft"
                          >
                            Start Progress
                          </button>
                        </form>
                      )}
                      {t.status !== "closed" && t.status !== "parts_pending" && (
                        <form
                          action={markTicketPartsPending.bind(null, params.id, t.id)}
                        >
                          <button
                            type="submit"
                            className="text-xs text-slate-500 underline hover:text-ink-soft"
                          >
                            Mark Parts Pending
                          </button>
                        </form>
                      )}
                      {t.status !== "closed" && (
                        <form action={resolveTicket.bind(null, params.id, t.id)}>
                          <button
                            type="submit"
                            className="text-xs text-slate-500 underline hover:text-ink-soft"
                          >
                            Mark Closed
                          </button>
                        </form>
                      )}
                      {t.work_order_id ? (
                        <Link
                          href="/work-orders"
                          className="text-xs text-blue-400 hover:underline"
                        >
                          {woRef(t.work_order_id)} →
                        </Link>
                      ) : (
                        t.status !== "closed" && (
                          <Link
                            href={`/work-orders/new?ticket_id=${t.id}`}
                            className="text-xs text-slate-500 underline hover:text-ink-soft"
                          >
                            + Create Work Order
                          </Link>
                        )
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              No service tickets yet.
            </p>
          )}

          <form
            action={boundCreateTicket}
            className="space-y-3 border-t border-hairline pt-4"
          >
            <h3 className="text-sm font-medium text-ink-soft">
              Raise a Service Request
            </h3>
            <textarea
              name="description"
              required
              rows={3}
              placeholder="Describe the issue…"
              className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <select
              name="priority"
              defaultValue="medium"
              className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <div>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
              >
                Submit Request
              </button>
            </div>
          </form>
        </div>

        {isStaff && (
          <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              History
            </h2>
            {history?.length ? (
              <ul className="divide-y divide-hairline text-sm">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {history.map((h: any) => (
                  <li key={h.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize text-ink">
                        {String(h.action).toLowerCase()}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(h.changed_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-500">
                      {h.profiles?.full_name ?? "System"}
                      {h.action === "UPDATE" &&
                      changedFields(h.old_data, h.new_data).length
                        ? ` changed: ${changedFields(h.old_data, h.new_data).join(", ")}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                No history recorded yet.
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AssetDetailReadOnly({ asset }: { asset: any }) {
  const rows: [string, string | null][] = [
    [
      "Equipment Type",
      EQUIPMENT_LABEL[asset.equipment_type] ?? asset.equipment_type,
    ],
    ["Brand", asset.brand],
    ["Model", asset.model],
    ["Serial Number", asset.serial_number],
    ["Install Date", asset.install_date],
    ["Warranty End Date", asset.warranty_end_date],
    ["Next Service Due", asset.next_service_due],
  ];

  return (
    <div className="rounded-xl border border-hairline bg-surface p-6">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <dt className="text-sm text-slate-500">Status</dt>
        <StatusBadge status={asset.status} />
      </div>
      <dl className="divide-y divide-hairline text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium text-ink">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
