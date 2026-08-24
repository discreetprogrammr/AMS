import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyStaff } from "@/lib/notify";

// Core logic for "Low-stock parts alerts" — a daily cron job
// (app/api/cron/low-stock-check/route.ts) calls runLowStockCheck() to
// proactively flag parts that have dropped to or below their reorder_level,
// instead of only ever being visible as a passive badge on the Parts page
// (app/parts/parts-table.tsx's stockStatus() — same precedence rules
// mirrored here: out_of_stock (quantity_on_hand <= 0) beats low_stock
// (quantity_on_hand <= reorder_level, and only when reorder_level > 0
// at all — 0 means "no threshold set").
//
// Unlike sla-escalation.ts / pm-automation.ts / compliance-alerts.ts, this
// ledger (schema_step39.sql) is NOT a permanent "already happened" record —
// see that migration's header comment for why. In short: stock levels go up
// and down repeatedly (restocks happen), so this stores the current level
// per part and clears the row entirely on recovery, which naturally re-arms
// the alert for the next time the same part goes low again.
type Level = "low" | "out_of_stock" | null;

function classify(quantityOnHand: number, reorderLevel: number): Level {
  if (quantityOnHand <= 0) return "out_of_stock";
  if (reorderLevel > 0 && quantityOnHand <= reorderLevel) return "low";
  return null;
}

function partLabel(part: { name: string; sku: string | null }): string {
  return part.sku ? `${part.name} (${part.sku})` : part.name;
}

export type LowStockEvent = {
  partId: string;
  partLabel: string;
  quantityOnHand: number;
  reorderLevel: number;
  eventType: "low" | "out_of_stock";
  alertId: string;
};

export type LowStockCheckResult = {
  checked: number;
  escalated: LowStockEvent[];
  recovered: number;
  skipped: number;
};

export async function runLowStockCheck(): Promise<LowStockCheckResult> {
  const supabase = createServiceRoleClient();

  const { data: parts, error } = await supabase
    .from("parts")
    .select("id, name, sku, quantity_on_hand, reorder_level");

  if (error) {
    throw new Error(`Failed to load parts: ${error.message}`);
  }

  const { data: existingRows, error: ledgerError } = await supabase
    .from("low_stock_alerts")
    .select("part_id, last_level");
  if (ledgerError) {
    throw new Error(`Failed to load low-stock ledger: ${ledgerError.message}`);
  }
  const ledger = new Map((existingRows ?? []).map((r) => [r.part_id as string, r.last_level as string]));

  const escalated: LowStockEvent[] = [];
  let recovered = 0;
  let skipped = 0;
  const checked = parts?.length ?? 0;

  for (const part of parts ?? []) {
    const level = classify(part.quantity_on_hand, part.reorder_level);
    const lastLevel = ledger.get(part.id) ?? null;

    if (level === null) {
      // Recovered (restocked back above reorder_level, or reorder_level
      // was reset to 0) — clear the ledger row so a future drop re-arms
      // the alert instead of staying silenced forever.
      if (lastLevel) {
        await supabase.from("low_stock_alerts").delete().eq("part_id", part.id);
        recovered++;
      }
      continue;
    }

    if (level === lastLevel) {
      // Already alerted at this exact level and nothing's changed since —
      // don't re-raise the same alert every single day it stays low.
      skipped++;
      continue;
    }

    const label = partLabel(part);
    const title =
      level === "out_of_stock"
        ? `Out of stock — ${label}`
        : `Low stock — ${label}`;
    const description =
      level === "out_of_stock"
        ? `${label} is out of stock (${part.quantity_on_hand} on hand). Reorder level is ${part.reorder_level}.`
        : `${label} is running low: ${part.quantity_on_hand} on hand, at or below the reorder level of ${part.reorder_level}.`;

    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .insert({
        // Parts aren't assets — no asset_id to link (alerts.asset_id is
        // nullable, schema_step10.sql), same as any other non-asset alert.
        asset_id: null,
        title,
        description,
        severity: level === "out_of_stock" ? "critical" : "caution",
        created_by: null,
      })
      .select("id")
      .single();
    if (alertError || !alert) {
      throw new Error(alertError?.message ?? "alert insert returned no row");
    }

    // Beyond the in-app alert/bell — same title/description, so the email/
    // push never says anything different from what's already in the Alerts
    // tab. Non-fatal (notifyStaff never throws).
    await notifyStaff(title, description);

    const { error: upsertError } = await supabase
      .from("low_stock_alerts")
      .upsert(
        { part_id: part.id, last_level: level, alert_id: alert.id, updated_at: new Date().toISOString() },
        { onConflict: "part_id" },
      );
    if (upsertError) {
      throw new Error(upsertError.message);
    }

    escalated.push({
      partId: part.id,
      partLabel: label,
      quantityOnHand: part.quantity_on_hand,
      reorderLevel: part.reorder_level,
      eventType: level,
      alertId: alert.id,
    });
  }

  return { checked, escalated, recovered, skipped };
}
