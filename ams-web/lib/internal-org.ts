import type { SupabaseClient } from "@supabase/supabase-js";
import { retryRead } from "@/lib/supabase/retry-read";

// Keeps Pacific Horizon Tek's own staff equipment (organizations.is_internal
// = true, schema_step46.sql) out of every client-facing number, list, export
// and cron job. See docs/HorizonCare360_Internal_Equipment_Spec_v0.1.md,
// section 6, and the README section for this step for the call-site list.
//
// Why "fetch the internal org ids, then filter" and not a join on
// organizations.is_internal: a join means adding `organizations!inner(...)`
// to every select string, behaves differently for head-count queries, and
// is two hops away for tickets. A `not in (ids)` filter composes onto an
// already-built query with no change to its select.
//
// FAILS CLOSED. If the lookup errors, this throws. Returning an empty list
// instead would silently let internal equipment back into client figures.
//
// RLS note: a client_viewer can only read their own organization, so for
// them the lookup is simply empty and nothing is filtered — which is
// correct, they could never see the internal organization anyway.

type Filterable<Q> = { not(column: string, operator: string, value: unknown): Q };

// One lookup per Supabase client, i.e. per page render / per cron run.
// A rejected lookup is evicted so a retry can succeed.
const orgIdCache = new WeakMap<object, Promise<string[]>>();
const scopeCache = new WeakMap<object, Promise<InternalScope>>();

export async function getInternalOrgIds(supabase: SupabaseClient): Promise<string[]> {
  const cached = orgIdCache.get(supabase);
  if (cached) return cached;

  const lookup = (async () => {
    const { data, error } = await retryRead("internal organization ids", () =>
      supabase.from("organizations").select("id").eq("is_internal", true),
    );
    if (error) {
      throw new Error(`Failed to look up internal organizations: ${error.message}`);
    }
    return (data ?? []).map((o: { id: string }) => o.id);
  })();

  orgIdCache.set(supabase, lookup);
  lookup.catch(() => orgIdCache.delete(supabase));
  return lookup;
}

/**
 * Adds "and <column> not in (internal org ids)" to a query. Pass the id
 * list from getInternalOrgIds(). Returns the query unchanged when there are
 * no internal organizations.
 *
 * `column` is `organization_id` on assets and sites. For tables without an
 * organization_id (tickets, work orders, service records ...) reach it
 * through the asset: select `assets!inner(organization_id)` and pass
 * `assets.organization_id` as the column.
 */
export function excludeInternal<Q extends Filterable<Q>>(
  query: Q,
  internalOrgIds: string[],
  column = "organization_id",
): Q {
  if (internalOrgIds.length === 0) return query;
  return query.not(column, "in", `(${internalOrgIds.join(",")})`);
}

export type InternalScope = {
  orgIds: Set<string>;
  siteIds: Set<string>;
  assetIds: Set<string>;
};

/**
 * Every id that belongs to the internal organization(s): the orgs, their
 * sites and their assets. For filtering audit_log rows, where a
 * `not in` filter on a JSON field would also drop every row whose JSON
 * simply lacks that key (SQL's NOT IN with NULL), so it is done in JS.
 *
 * Assets are read in one unpaged query, subject to PostgREST's default row
 * cap (1000). Fine for a ~100-item internal register; revisit if it grows.
 */
export async function getInternalScope(supabase: SupabaseClient): Promise<InternalScope> {
  const cached = scopeCache.get(supabase);
  if (cached) return cached;

  const lookup = (async () => {
    const orgIds = await getInternalOrgIds(supabase);
    if (orgIds.length === 0) {
      return { orgIds: new Set<string>(), siteIds: new Set<string>(), assetIds: new Set<string>() };
    }
    const [sites, assets] = await Promise.all([
      retryRead("internal site ids", () =>
        supabase.from("sites").select("id").in("organization_id", orgIds),
      ),
      retryRead("internal asset ids", () =>
        supabase.from("assets").select("id").in("organization_id", orgIds),
      ),
    ]);
    if (sites.error) throw new Error(`Failed to look up internal sites: ${sites.error.message}`);
    if (assets.error) throw new Error(`Failed to look up internal assets: ${assets.error.message}`);
    return {
      orgIds: new Set(orgIds),
      siteIds: new Set((sites.data ?? []).map((s: { id: string }) => s.id)),
      assetIds: new Set((assets.data ?? []).map((a: { id: string }) => a.id)),
    };
  })();

  scopeCache.set(supabase, lookup);
  lookup.catch(() => scopeCache.delete(supabase));
  return lookup;
}

type AuditRow = {
  table_name: string;
  record_id: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
};

/**
 * True when an audit_log row is about the internal organization, one of
 * its sites, one of its assets, or a child record pointing at them. Uses
 * new_data, falling back to old_data for DELETEs (a deleted internal asset
 * is no longer in `assetIds`, but its snapshot still names its
 * organization).
 */
export function isInternalAuditRow(row: AuditRow, scope: InternalScope): boolean {
  if (scope.orgIds.size === 0) return false;

  const data = row.new_data ?? row.old_data ?? {};
  const orgId = data.organization_id;
  const assetId = data.asset_id;
  const siteId = data.site_id;

  if (typeof orgId === "string" && scope.orgIds.has(orgId)) return true;
  if (typeof assetId === "string" && scope.assetIds.has(assetId)) return true;
  if (typeof siteId === "string" && scope.siteIds.has(siteId)) return true;

  switch (row.table_name) {
    case "organizations":
      return scope.orgIds.has(row.record_id);
    case "sites":
      return scope.siteIds.has(row.record_id);
    case "assets":
      return scope.assetIds.has(row.record_id);
    default:
      return false;
  }
}
