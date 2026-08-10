import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { updateOrganization, createSite, updateSiteLocation } from "../actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string };
}) {
  await requireStaff("/clients");
  const profile = await getProfile();

  const supabase = await createClient();

  const [{ data: organization }, { data: sites }, { data: assets }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, sector, primary_contact, email")
        .eq("id", params.id)
        .single(),
      supabase
        .from("sites")
        .select("id, address, site_contact, latitude, longitude")
        .eq("organization_id", params.id)
        .order("address"),
      supabase
        .from("assets")
        .select("id, asset_tag, equipment_type, brand, model, status")
        .eq("organization_id", params.id)
        .order("asset_tag"),
    ]);

  if (!organization) notFound();

  const boundUpdate = updateOrganization.bind(null, params.id);
  const boundCreateSite = createSite.bind(null, params.id);

  return (
    <AppShell
      profile={profile}
      title={organization.name}
      subtitle="Client details, sites, and registered assets."
      actions={
        <Link
          href="/clients"
          className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
        >
          ← Back to Clients
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {searchParams?.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        {searchParams?.saved === "1" && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Saved.
          </p>
        )}

        <form
          action={boundUpdate}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Client Details
          </h2>
          <div>
            <label className={labelClass}>Client Name</label>
            <input
              name="name"
              required
              defaultValue={organization.name}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Sector</label>
            <input
              name="sector"
              defaultValue={organization.sector ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Primary Contact</label>
            <input
              name="primary_contact"
              defaultValue={organization.primary_contact ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              name="email"
              type="email"
              defaultValue={organization.email ?? ""}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Save Changes
            </button>
            <Link
              href="/clients"
              className="rounded-lg border border-hairline px-5 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Cancel
            </Link>
          </div>
        </form>

        <div className="rounded-xl border border-hairline bg-surface p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Sites
          </h2>
          {sites?.length ? (
            <ul className="mb-4 divide-y divide-hairline text-sm">
              {sites.map((site) => {
                const boundUpdateLocation = updateSiteLocation.bind(
                  null,
                  params.id,
                  site.id,
                );
                const hasCoords =
                  site.latitude != null && site.longitude != null;
                return (
                  <li key={site.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{site.address}</p>
                        {site.site_contact && (
                          <p className="text-xs text-slate-500">
                            Contact: {site.site_contact}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-xs ${hasCoords ? "text-emerald-400" : "text-slate-500"}`}
                      >
                        {hasCoords
                          ? "On Fleet Map"
                          : "Not on Fleet Map yet"}
                      </span>
                    </div>
                    <form
                      action={boundUpdateLocation}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <div>
                        <label className="block text-xs text-slate-500">
                          Latitude
                        </label>
                        <input
                          name="latitude"
                          type="number"
                          step="0.000001"
                          defaultValue={site.latitude ?? ""}
                          placeholder="e.g. 14.5995"
                          className="mt-0.5 w-32 rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">
                          Longitude
                        </label>
                        <input
                          name="longitude"
                          type="number"
                          step="0.000001"
                          defaultValue={site.longitude ?? ""}
                          placeholder="e.g. 120.9842"
                          className="mt-0.5 w-32 rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg border border-hairline px-3 py-1 text-xs text-ink-soft hover:bg-surface-2"
                      >
                        Save Location
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              No sites on file yet.
            </p>
          )}

          <form
            action={boundCreateSite}
            className="flex flex-wrap items-end gap-3 border-t border-hairline pt-4"
          >
            <div className="flex-1">
              <label className={labelClass}>Add Site — Address</label>
              <input name="address" required className={inputClass} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Site Contact</label>
              <input name="site_contact" className={inputClass} />
            </div>
            <div className="w-32">
              <label className={labelClass}>Latitude</label>
              <input
                name="latitude"
                type="number"
                step="0.000001"
                placeholder="Optional"
                className={inputClass}
              />
            </div>
            <div className="w-32">
              <label className={labelClass}>Longitude</label>
              <input
                name="longitude"
                type="number"
                step="0.000001"
                placeholder="Optional"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-surface-2"
            >
              + Add Site
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Add latitude/longitude to plot a site on the Fleet Map. Sites
            without coordinates just won&apos;t appear there yet.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Registered Assets
            </h2>
            <Link
              href="/assets/new"
              className="text-sm text-blue-400 hover:underline"
            >
              + Add Asset
            </Link>
          </div>
          {assets?.length ? (
            <ul className="divide-y divide-hairline text-sm">
              {assets.map((asset) => (
                <li
                  key={asset.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <Link
                      href={`/assets/${asset.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {asset.asset_tag}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {[asset.brand, asset.model].filter(Boolean).join(" / ") ||
                        asset.equipment_type}
                    </p>
                  </div>
                  <StatusBadge status={asset.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No assets registered to this client yet.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
