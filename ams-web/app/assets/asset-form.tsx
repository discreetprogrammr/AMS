import Link from "next/link";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  OWNERSHIPS,
  SEGMENTS,
} from "@/lib/internal-equipment";

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
  // Internal equipment (schema_step46.sql)
  segment?: string | null;
  asset_category?: string | null;
  description?: string | null;
  quantity?: number | null;
  ownership?: string | null;
  date_acquired?: string | null;
  acquisition_cost?: number | string | null;
  supplier?: string | null;
  department?: string | null;
  date_issued?: string | null;
  assignment_status?: string | null;
  condition?: string | null;
  return_disposal_date?: string | null;
  remarks?: string | null;
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
  mode = "client",
  suggestedTag,
}: {
  organizations: Organization[];
  action: (formData: FormData) => void;
  defaultValues?: AssetFormValues;
  submitLabel?: string;
  cancelHref?: string;
  // "internal" renders the PHtek staff-equipment form (spec 4.2 / 7.3);
  // `organizations` is then exactly one entry, shown locked. "client" is
  // the original form, unchanged.
  mode?: "client" | "internal";
  // Internal new-asset form only: the next free PHT-EQ number, prefilled.
  suggestedTag?: string;
}) {
  // A defaultValues object with no asset_tag means this is the "New Asset"
  // form — the Asset ID is auto-generated server-side in createAsset()
  // once Equipment Type is known, so there's nothing to type here. On the
  // edit form (defaultValues.asset_tag is set), it stays a normal editable
  // field in case a correction is genuinely needed later.
  const isEditing = defaultValues?.asset_tag !== undefined;

  if (mode === "internal") {
    const org = organizations[0];
    const d = defaultValues;
    return (
      <form
        action={action}
        className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
      >
        <input type="hidden" name="organization_id" value={org?.id ?? ""} />
        {suggestedTag && <input type="hidden" name="suggested_tag" value={suggestedTag} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Organization</label>
            <div className={`${inputClass} flex items-center text-ink-soft`}>
              {org?.name ?? "—"}
            </div>
          </div>
          <div>
            <label className={labelClass}>Segment</label>
            <select
              name="segment"
              required
              defaultValue={d?.segment ?? ""}
              className={inputClass}
            >
              <option value="" disabled>
                Select…
              </option>
              {SEGMENTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Asset No.</label>
            <input
              name="asset_tag"
              required
              defaultValue={d?.asset_tag ?? suggestedTag ?? ""}
              placeholder="PHT-EQ-0001"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-ink-soft">
              Next free number is prefilled. Change it only if you need to.
            </p>
          </div>
          <div>
            <label className={labelClass}>Equipment Category</label>
            <input
              name="asset_category"
              defaultValue={d?.asset_category ?? ""}
              placeholder="e.g. Laptop, Mobile Phone, Monitor"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Equipment / Description</label>
          <input
            name="description"
            defaultValue={d?.description ?? ""}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Brand</label>
            <input name="brand" defaultValue={d?.brand ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input name="model" defaultValue={d?.model ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Qty</label>
            <input
              type="number"
              name="quantity"
              min={1}
              step={1}
              defaultValue={d?.quantity ?? 1}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Serial No.</label>
            <input
              name="serial_number"
              defaultValue={d?.serial_number ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Current Location</label>
            <input
              name="site_address"
              defaultValue={d?.site_address ?? (isEditing ? "" : "Head Office")}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Ownership</label>
            <select name="ownership" defaultValue={d?.ownership ?? ""} className={inputClass}>
              <option value="">—</option>
              {OWNERSHIPS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Supplier</label>
            <input name="supplier" defaultValue={d?.supplier ?? ""} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Date Acquired</label>
            <input
              type="date"
              name="date_acquired"
              defaultValue={d?.date_acquired ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Acquisition Cost (PHP)</label>
            <input
              type="number"
              name="acquisition_cost"
              min={0}
              step="0.01"
              defaultValue={d?.acquisition_cost ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Assigned To / Custodian</label>
            <input name="custodian" defaultValue={d?.custodian ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input name="department" defaultValue={d?.department ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Date Issued</label>
            <input
              type="date"
              name="date_issued"
              defaultValue={d?.date_issued ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Assignment Status</label>
            <select
              name="assignment_status"
              defaultValue={d?.assignment_status ?? ""}
              className={inputClass}
            >
              <option value="">—</option>
              {ASSIGNMENT_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Condition</label>
            <select name="condition" defaultValue={d?.condition ?? ""} className={inputClass}>
              <option value="">—</option>
              {CONDITIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="-mt-3 text-xs text-ink-soft">
          Operating status (Operational / Attention / Down / Unserviceable) is
          set automatically from Assignment Status and Condition.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Warranty Expiry</label>
            <input
              type="date"
              name="warranty_end_date"
              defaultValue={d?.warranty_end_date ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Return / Disposal Date</label>
            <input
              type="date"
              name="return_disposal_date"
              defaultValue={d?.return_disposal_date ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Remarks</label>
          <textarea
            name="remarks"
            rows={3}
            defaultValue={d?.remarks ?? ""}
            className={inputClass}
          />
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
