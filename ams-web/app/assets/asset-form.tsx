"use client";

import { useMemo, useState } from "react";

type Organization = { id: string; name: string };
type Site = { id: string; address: string | null; organization_id: string };

type AssetFormValues = {
  organization_id?: string;
  site_id?: string | null;
  asset_tag?: string;
  equipment_type?: string;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  sold_by?: string;
  install_date?: string | null;
  status?: string;
  warranty_end_date?: string | null;
  custodian?: string | null;
  pnri_license_number?: string | null;
  next_service_due?: string | null;
};

export function AssetForm({
  organizations,
  sites,
  action,
  defaultValues,
  submitLabel = "Save Asset",
}: {
  organizations: Organization[];
  sites: Site[];
  action: (formData: FormData) => void;
  defaultValues?: AssetFormValues;
  submitLabel?: string;
}) {
  const [organizationId, setOrganizationId] = useState(
    defaultValues?.organization_id ?? "",
  );

  const filteredSites = useMemo(
    () => sites.filter((site) => site.organization_id === organizationId),
    [sites, organizationId],
  );

  return (
    <form
      action={action}
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-6"
    >
      <div>
        <label className="block text-sm font-medium">Organization</label>
        <select
          name="organization_id"
          required
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="" disabled>
            Select organization…
          </option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Site</label>
        <select
          name="site_id"
          defaultValue={defaultValues?.site_id ?? ""}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="">No specific site</option>
          {filteredSites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.address}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Asset Tag</label>
          <input
            name="asset_tag"
            required
            defaultValue={defaultValues?.asset_tag ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Equipment Type</label>
          <select
            name="equipment_type"
            required
            defaultValue={defaultValues?.equipment_type ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="" disabled>
              Select…
            </option>
            <option value="xray_screening">X-ray Screening</option>
            <option value="people_threat_screening">
              People / Threat Screening
            </option>
            <option value="water_generation">Water Generation</option>
            <option value="pump">Pump</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Brand</label>
          <input
            name="brand"
            defaultValue={defaultValues?.brand ?? ""}
            placeholder="Linev, Astrophysics, Rapiscan, Nuctech…"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Model</label>
          <input
            name="model"
            defaultValue={defaultValues?.model ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Serial Number</label>
          <input
            name="serial_number"
            defaultValue={defaultValues?.serial_number ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Sold By</label>
          <select
            name="sold_by"
            required
            defaultValue={defaultValues?.sold_by ?? "pacific_horizon_tek"}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="pacific_horizon_tek">Pacific Horizon Tek</option>
            <option value="third_party">Third-party / Client-owned</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select
            name="status"
            required
            defaultValue={defaultValues?.status ?? "operational"}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="operational">Operational</option>
            <option value="under_maintenance">Under Maintenance</option>
            <option value="unserviceable">Unserviceable</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Custodian</label>
          <input
            name="custodian"
            defaultValue={defaultValues?.custodian ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Install Date</label>
          <input
            type="date"
            name="install_date"
            defaultValue={defaultValues?.install_date ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">
            Warranty End Date
          </label>
          <input
            type="date"
            name="warranty_end_date"
            defaultValue={defaultValues?.warranty_end_date ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">
            Next Service Due
          </label>
          <input
            type="date"
            name="next_service_due"
            defaultValue={defaultValues?.next_service_due ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">
            PNRI License # (X-ray only)
          </label>
          <input
            name="pnri_license_number"
            defaultValue={defaultValues?.pnri_license_number ?? ""}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <button
        type="submit"
        className="rounded bg-slate-900 px-5 py-2 text-white hover:bg-slate-700"
      >
        {submitLabel}
      </button>
    </form>
  );
}
