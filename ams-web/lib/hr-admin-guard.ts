import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";

// Server-side guards for the "HR & Admin" preset (lib/hr-admin-preset.ts).
// Middleware stops preset users reaching pages; /api/* is outside the
// middleware matcher on purpose (cron), and server actions can be posted to
// directly, so each route and action that is client-only checks here too.
// Everything is a no-op for anyone without the preset.

/** For route handlers: a 403 Response for preset users, otherwise null. */
export async function forbidHrAdminPreset(): Promise<Response | null> {
  const profile = await getProfile();
  if (profile && isHrAdminPreset(profile.hidden_modules)) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

/** For server actions on client-only features: bounce preset users to /assets. */
export async function denyHrAdminPresetAction(redirectTo = "/assets"): Promise<void> {
  const profile = await getProfile();
  if (profile && isHrAdminPreset(profile.hidden_modules)) redirect(redirectTo);
}

/**
 * For actions that are client-facing for everyone else but fine on internal
 * equipment (documents and photos): a preset user is let through only when
 * the asset belongs to an internal organization. No-op for anyone else.
 */
export async function denyHrAdminPresetUnlessInternalAsset(assetId: string, redirectTo = "/assets"): Promise<void> {
  const profile = await getProfile();
  if (!profile || !isHrAdminPreset(profile.hidden_modules)) return;
  const supabase = await createClient();
  const [{ data: asset }, internalOrgIds] = await Promise.all([
    supabase.from("assets").select("organization_id").eq("id", assetId).maybeSingle(),
    getInternalOrgIds(supabase),
  ]);
  if (!asset || !internalOrgIds.includes(asset.organization_id)) redirect(redirectTo);
}

// Every table with `asset_id ... on delete cascade` to assets (schema.sql
// and schema_step5/9/10/11/12/29/35). Deleting an asset would silently take
// all of these rows with it, so the preset's delete refuses instead.
export const ASSET_LINKED_TABLES = [
  { table: "service_records", singular: "service record", plural: "service records" },
  { table: "compliance_certificates", singular: "certificate", plural: "certificates" },
  { table: "service_tickets", singular: "ticket", plural: "tickets" },
  { table: "inventory_cycle_items", singular: "inventory-cycle entry", plural: "inventory-cycle entries" },
  { table: "work_orders", singular: "work order", plural: "work orders" },
  { table: "alerts", singular: "alert", plural: "alerts" },
  { table: "inspections", singular: "inspection", plural: "inspections" },
  { table: "calendar_events", singular: "calendar event", plural: "calendar events" },
  { table: "pm_auto_runs", singular: "PM schedule run", plural: "PM schedule runs" },
  { table: "asset_documents", singular: "document", plural: "documents" },
] as const;

/**
 * What stops an asset being deleted: child assets (parent_asset_id, which
 * would be silently orphaned) and linked rows in the ten cascade tables.
 * Returns a sentence, or null when nothing blocks. A failed count is a
 * block too: this must fail closed, since the alternative is a cascade.
 */
export async function assetDeleteBlocker(
  supabase: SupabaseClient,
  assetId: string,
  assetTag: string,
): Promise<string | null> {
  const counts = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("parent_asset_id", assetId),
    ...ASSET_LINKED_TABLES.map((t) =>
      supabase.from(t.table).select("id", { count: "exact", head: true }).eq("asset_id", assetId),
    ),
  ]);

  const failed = counts.find((c) => c.error);
  if (failed?.error) {
    return `${assetTag} was not deleted: could not check what is linked to it (${failed.error.message}).`;
  }

  const parts: string[] = [];
  const children = counts[0].count ?? 0;
  if (children > 0) parts.push(`${children} child asset${children === 1 ? "" : "s"}`);
  ASSET_LINKED_TABLES.forEach((t, i) => {
    const n = counts[i + 1].count ?? 0;
    if (n > 0) parts.push(`${n} ${n === 1 ? t.singular : t.plural}`);
  });

  if (parts.length === 0) return null;
  return `${assetTag} cannot be deleted: it has ${parts.join(", ")}. Remove or reassign ${parts.length === 1 && children === 1 ? "the child asset" : "those"} first.`;
}
