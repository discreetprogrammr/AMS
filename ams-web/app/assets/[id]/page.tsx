import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffViewRole } from "@/lib/supabase/profile";
import { changedFields } from "@/lib/audit";
import { woRef, dateTimeLabel } from "@/lib/format";
import { generateQrDataUrl } from "@/lib/qr";
import { categoryLabel, formatFileSize } from "@/lib/documents";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { AssetForm } from "../asset-form";
import { DeleteAssetButton } from "../delete-asset-button";
import { updateAsset } from "../actions";
import {
  createTicket,
  resolveTicket,
  acknowledgeTicket,
  markTicketPartsPending,
} from "../tickets-actions";
import { deleteDocument } from "./documents-actions";
import { UploadDocumentButton } from "./upload-document-button";
import { InternalDocumentsCard } from "./internal-documents-card";
import { loadInternalActivity } from "@/lib/activity";
import { canViewActivity } from "@/lib/hr-admin-preset";
import { getInternalOrgIds } from "@/lib/internal-org";
import { loadCustodianNames } from "../custodian-names";

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
  const isStaff = isStaffViewRole(profile?.role);

  const [
    { data: asset },
    { data: organizations },
    { data: tickets },
    { data: certificates },
    { data: documents },
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
    supabase.from("organizations").select("id, name, is_internal").order("name"),
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
    // RLS ("read own org asset documents or all if staff", schema_step35.sql)
    // scopes this the same way certificates above already are.
    supabase
      .from("asset_documents")
      .select("id, category, title, file_name, file_size, mime_type, created_at")
      .eq("asset_id", params.id)
      .order("created_at", { ascending: false }),
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

  // HR & Admin preset: internal equipment only. A client asset is "not
  // found" for them, and the client-facing sections (QR/checklist links,
  // certificates, documents, tickets) are not shown on an internal one.
  const presetUser = isHrAdminPreset(profile?.hidden_modules);

  // An internal asset gets the internal form with its organization locked;
  // a client asset only ever sees client organizations in the picker.
  const isInternalAsset = (organizations ?? []).some(
    (o) => o.id === asset.organization_id && o.is_internal,
  );
  if (presetUser && !isInternalAsset) notFound();

  // Custodian history (schema_step48.sql), internal assets only. If the
  // step has not been run yet the query errors; the page says so rather
  // than failing.
  const { data: custodyRows, error: custodyError } =
    isStaff && isInternalAsset
      ? await supabase
          .from("asset_custodian_history")
          .select("id, custodian, department, started_at, ended_at, profiles(full_name)")
          .eq("asset_id", params.id)
          .order("started_at", { ascending: false })
      : { data: null, error: null };
  // Assemblies (lib/assemblies.ts): the parts of this item, if it is one, and
  // the item this one is a part of, if it is a part.
  const [{ data: partRows }, { data: parentRow }] =
    isStaff && isInternalAsset
      ? await Promise.all([
          supabase
            .from("assets")
            .select("id, asset_tag, description, brand, model, serial_number, warranty_end_date")
            .eq("parent_asset_id", params.id)
            .order("asset_tag", { ascending: true }),
          asset.parent_asset_id
            ? supabase.from("assets").select("id, asset_tag, description").eq("id", asset.parent_asset_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
      : [{ data: null }, { data: null }];

  // Names for the Custodian drop-down on an internal item's form.
  const custodianNames =
    isStaff && isInternalAsset
      ? await loadCustodianNames(supabase, await getInternalOrgIds(supabase), asset.custodian)
      : [];

  // The audit trail itself is Super Admin only, so an admin's own History card
  // came back empty. For internal equipment it is read through the Activity
  // loader, which is limited to internal equipment.
  const internalHistory =
    isStaff && isInternalAsset && canViewActivity(profile?.role, profile?.hidden_modules)
      ? await loadInternalActivity({ assetId: params.id, limit: 50 })
      : null;
  const formOrganizations = (organizations ?? []).filter((o) =>
    isInternalAsset ? o.id === asset.organization_id : !o.is_internal,
  );

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
                {presetUser
                  ? "Print this onto a physical tag — scanning it with any phone camera jumps straight here instead of a manual search."
                  : "Print this onto a physical tag — scanning it (with the app's Scan Asset page, or any phone camera) jumps straight here instead of a manual search."}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={qrDataUrl}
                  download={`${asset.asset_tag}-qr.png`}
                  className="text-xs font-medium text-blue-400 hover:underline"
                >
                  Download QR →
                </a>
                {isInternalAsset && (
                  <Link
                    href={`/assets/labels?id=${asset.id}`}
                    className="text-xs font-medium text-blue-400 hover:underline"
                  >
                    Print label →
                  </Link>
                )}
                {!isInternalAsset && (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {parentRow && (
          <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-400">
            Part of{" "}
            <Link href={`/assets/${parentRow.id}`} className="font-semibold underline">
              {parentRow.asset_tag}
            </Link>
            {parentRow.description ? ` · ${parentRow.description}` : ""}
          </p>
        )}

        {isStaff ? (
          <AssetForm
            organizations={formOrganizations}
            mode={isInternalAsset ? "internal" : "client"}
            action={boundUpdate}
            custodianNames={custodianNames}
            defaultValues={{
              ...asset,
              site_address: asset.sites?.address ?? "",
            }}
            submitLabel="Update Asset"
          />
        ) : (
          <AssetDetailReadOnly asset={asset} />
        )}

        {isStaff && isInternalAsset && (
          <div className="mt-4 flex justify-end">
            <DeleteAssetButton assetId={asset.id} assetTag={asset.asset_tag} guarded={presetUser} />
          </div>
        )}

        {isStaff && isInternalAsset && (
          <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Custodian History</h2>
              <Link
                href={`/assets/${asset.id}/handover`}
                className="text-xs font-medium text-blue-400 hover:underline"
              >
                Print handover form →
              </Link>
            </div>
            {custodyError ? (
              <p className="text-sm text-slate-500">
                Custodian history is not set up yet. Run schema_step48.sql in the Supabase SQL editor.
              </p>
            ) : custodyRows?.length ? (
              <ul className="divide-y divide-hairline text-sm">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {custodyRows.map((c: any) => (
                  <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                    <span className="font-medium text-ink">
                      {c.custodian}
                      {c.department ? <span className="font-normal text-slate-500"> · {c.department}</span> : null}
                    </span>
                    <span className="text-xs text-slate-500">
                      {dateTimeLabel(c.started_at)} →{" "}
                      {c.ended_at ? dateTimeLabel(c.ended_at) : <span className="text-emerald-400">Current</span>}
                      {c.profiles?.full_name ? ` · set by ${c.profiles.full_name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No custodian has been recorded for this item yet.</p>
            )}
          </div>
        )}

        {partRows && partRows.length > 0 && (
          <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Parts of this item <span className="font-normal text-slate-500">({partRows.length})</span>
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              This is an assembly record that groups its parts. Each part is counted as its own item.
            </p>
            <ul className="divide-y divide-hairline text-sm">
              {partRows.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                  <span>
                    <Link href={`/assets/${p.id}`} className="font-medium text-ink hover:underline">
                      {p.asset_tag}
                    </Link>
                    <span className="text-ink-soft">
                      {" · "}
                      {p.description || [p.brand, p.model].filter(Boolean).join(" ") || "—"}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {[p.brand, p.model].filter(Boolean).join(" ")}
                    {p.serial_number ? ` · SN ${p.serial_number}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isStaff && isInternalAsset && (
          <InternalDocumentsCard assetId={params.id} documents={documents ?? []} canEdit />
        )}

        {!isInternalAsset && (
          <>
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Documents
            </h2>
            {isStaff && <UploadDocumentButton assetId={params.id} />}
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Manuals, datasheets, and compliance paperwork on file for this asset.
          </p>
          {documents?.length ? (
            <ul className="divide-y divide-hairline text-sm">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <a
                      href={`/api/documents/${d.id}/download`}
                      className="font-medium text-ink hover:underline"
                    >
                      {d.title}
                    </a>
                    <p className="text-xs text-slate-500">
                      {categoryLabel(d.category)}
                      {d.file_size ? ` · ${formatFileSize(d.file_size)}` : ""}
                    </p>
                  </div>
                  {isStaff && (
                    <form action={deleteDocument.bind(null, params.id, d.id)}>
                      <button
                        type="submit"
                        className="whitespace-nowrap text-xs text-slate-500 underline hover:text-red-400"
                      >
                        Delete
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No documents on file yet.
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

          </>
        )}

        {isStaff && (
          <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              History
            </h2>
            {internalHistory ? (
              internalHistory.entries.length ? (
                <ul className="divide-y divide-hairline text-sm">
                  {internalHistory.entries.map((e) => (
                    <li key={e.id} className="py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize text-ink">
                          {e.kind === "file" ? "file" : e.kind}
                        </span>
                        <span className="text-xs text-slate-500">{dateTimeLabel(e.at)}</span>
                      </div>
                      <p className="text-slate-500">
                        {e.who}
                        {e.kind === "file" ? `: ${e.lines[0]?.toLowerCase()} (${e.item})` : ""}
                      </p>
                      {e.lines.length > 0 && e.kind !== "file" && (
                        <ul className="mt-0.5 space-y-0.5 text-xs text-ink-soft">
                          {e.lines.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No history recorded yet.</p>
              )
            ) : history?.length ? (
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
