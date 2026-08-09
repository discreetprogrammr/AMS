import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { AssetForm } from "../asset-form";
import { updateAsset } from "../actions";
import { createTicket, resolveTicket } from "../tickets-actions";

const STATUS_LABEL: Record<string, string> = {
  operational: "Operational",
  under_maintenance: "Under Maintenance",
  unserviceable: "Unserviceable",
};

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
  searchParams: { error?: string; ticket?: string };
}) {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = profile?.role === "internal_staff";

  const [
    { data: asset },
    { data: organizations },
    { data: sites },
    { data: tickets },
    { data: certificates },
  ] = await Promise.all([
    supabase.from("assets").select("*").eq("id", params.id).single(),
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("sites")
      .select("id, address, organization_id")
      .order("address"),
    supabase
      .from("service_tickets")
      .select("id, description, status, priority, created_at")
      .eq("asset_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("compliance_certificates")
      .select("id, certificate_type, issue_date, expiry_date")
      .eq("asset_id", params.id)
      .order("expiry_date", { ascending: true }),
  ]);

  if (!asset) notFound();

  const boundUpdate = updateAsset.bind(null, params.id);
  const boundCreateTicket = createTicket.bind(null, params.id);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {isStaff ? "Edit Asset" : "Asset Details"} — {asset.asset_tag}
        </h1>
        <Link
          href="/assets"
          className="text-sm text-slate-500 hover:underline"
        >
          ← Back to Assets
        </Link>
      </div>

      {searchParams?.error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}
      {searchParams?.ticket === "submitted" && (
        <p className="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          Service request submitted.
        </p>
      )}

      {isStaff ? (
        <AssetForm
          organizations={organizations ?? []}
          sites={sites ?? []}
          action={boundUpdate}
          defaultValues={asset}
          submitLabel="Update Asset"
        />
      ) : (
        <AssetDetailReadOnly asset={asset} />
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
          Compliance Certificates
        </h2>
        {certificates?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {certificates.map((c: any) => (
              <li
                key={c.id}
                className="flex items-center justify-between py-2"
              >
                <span>{c.certificate_type}</span>
                <span className="text-slate-500">
                  Expires {c.expiry_date ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            No certificates on file yet.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
          Service Tickets
        </h2>
        {tickets?.length ? (
          <ul className="mb-4 divide-y divide-slate-100 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {tickets.map((t: any) => (
              <li key={t.id} className="py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">
                    {String(t.status).replace("_", " ")} · {t.priority}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">{t.description}</p>
                {isStaff && t.status !== "resolved" && (
                  <form action={resolveTicket.bind(null, params.id, t.id)}>
                    <button
                      type="submit"
                      className="mt-1 text-xs text-slate-500 underline hover:text-slate-800"
                    >
                      Mark Resolved
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-400">
            No service tickets yet.
          </p>
        )}

        <form
          action={boundCreateTicket}
          className="space-y-3 border-t border-slate-100 pt-4"
        >
          <h3 className="text-sm font-medium">Raise a Service Request</h3>
          <textarea
            name="description"
            required
            rows={3}
            placeholder="Describe the issue…"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="priority"
            defaultValue="medium"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <div>
            <button
              type="submit"
              className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
            >
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
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
    ["Status", STATUS_LABEL[asset.status] ?? asset.status],
    ["Install Date", asset.install_date],
    ["Warranty End Date", asset.warranty_end_date],
    ["Next Service Due", asset.next_service_due],
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <dl className="divide-y divide-slate-100 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
