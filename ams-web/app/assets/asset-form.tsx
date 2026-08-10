import Link from "next/link";

type Organization = { id: string; name: string };

type AssetFormValues = {
  organization_id?: string;
  site_address?: string | null;
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

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

// No client state left in here — Site used to be a <select> filtered by
// the chosen Organization (the only reason this was a "use client"
// component), but it's now a plain text field resolved server-side (see
// resolveSiteId in actions.ts), so this can be a regular server component.
export function AssetForm({
  organizations,
  action,
  defaultValues,
  submitLabel = "Save Asset",
  cancelHref = "/assets",
}: {
  organizations: Organization[];
  action: (formData: FormData) => void;
  defaultValues?: AssetFormValues;
  submitLabel?: string;
  cancelHref?: string;
}) {
  // A defaultValues object with no asset_tag means this is the "New Asset"
  // form — the Asset ID is auto-generated server-side in createAsset()
  // once Equipment Type is known, so there's nothing to type here. On the
  // edit form (defaultValues.asset_tag is set), it stays a normal editable
  // field in case a correction is genuinely needed later.
  const isEditing = defaultValues?.asset_tag !== undefined;

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
    >
      <div>
        <label className={labelClass}>Organization</label>
        <select
          name="organization_id"
          required
          defaultValue={defaultValues?.organization_id ?? ""}
          className={inputClass}
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
        <label className={labelClass}>Site</label>
        <input
          name="site_address"
          defaultValue={defaultValues?.site_address ?? ""}
          placeholder="e.g. NAIA Terminal 3, Pasay City"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">
          Type the site&apos;s address. If it doesn&apos;t already exist for
          this client, it&apos;s created automatically — leave blank for
          &quot;no specific site.&quot;
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Asset ID</label>
          {isEditing ? (
            <input
              name="asset_tag"
              required
              defaultValue={defaultValues?.asset_tag ?? ""}
              className={inputClass}
            />
          ) : (
            <div
              className={`${inputClass} flex items-center text-slate-500`}
            >
              Auto-generated from Equipment Type on save
            </div>
          )}
        </div>
        <div>
          <label className={labelClass}>Equipment Type</label>
          <select
            name="equipment_type"
            required
            defaultValue={defaultValues?.equipment_type ?? ""}
            className={inputClass}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Brand</label>
          <input
            name="brand"
            defaultValue={defaultValues?.brand ?? ""}
            placeholder="Linev, Astrophysics, Rapiscan, Nuctech…"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Model</label>
          <input
            name="model"
            defaultValue={defaultValues?.model ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Serial Number</label>
          <input
            name="serial_number"
            defaultValue={defaultValues?.serial_number ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Sold By</label>
          <select
            name="sold_by"
            required
            defaultValue={defaultValues?.sold_by ?? "pacific_horizon_tek"}
            className={inputClass}
          >
            <option value="pacific_horizon_tek">Pacific Horizon Tek</option>
            <option value="third_party">Third-party / Client-owned</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Status</label>
          <select
            name="status"
            required
            defaultValue={defaultValues?.status ?? "operational"}
            className={inputClass}
          >
            <option value="operational">Operational</option>
            <option value="attention">Attention</option>
            <option value="down">Down</option>
            <option value="unserviceable">Unserviceable</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Custodian</label>
          <input
            name="custodian"
            defaultValue={defaultValues?.custodian ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Install Date</label>
          <input
            type="date"
            name="install_date"
            defaultValue={defaultValues?.install_date ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Warranty End Date</label>
          <input
            type="date"
            name="warranty_end_date"
            defaultValue={defaultValues?.warranty_end_date ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Next Service Due</label>
          <input
            type="date"
            name="next_service_due"
            defaultValue={defaultValues?.next_service_due ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>PNRI License # (X-ray only)</label>
          <input
            name="pnri_license_number"
            defaultValue={defaultValues?.pnri_license_number ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-lg border border-hairline px-5 py-2 text-sm text-ink-soft hover:bg-surface-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
