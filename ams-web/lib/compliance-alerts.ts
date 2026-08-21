import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Core logic for "Compliance certificate & warranty expiry alerts" — a
// daily cron job (app/api/cron/compliance-check/route.ts) calls
// runComplianceCheck() to proactively flag certificates and warranties
// that are getting close to, or have already passed, their expiry date.
// Same idempotent-escalation shape as lib/sla-escalation.ts and
// lib/pm-automation.ts: an `alerts` row only ever gets raised once per
// (record, event) pair, guaranteed by compliance_escalations' unique
// constraint (schema_step34.sql).
//
// Certs and warranties are longer-horizon than an 8h SLA or a 7-day PM
// reminder — 30 days gives enough runway to actually renew or extend
// something before it lapses, especially for X-ray/NII compliance
// certificates where renewal can itself take time.
const DEFAULT_LEAD_DAYS = 30;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Level = "approaching" | "expired" | null;

function classify(expiryDate: string, today: string, horizon: string): Level {
  if (expiryDate < today) return "expired";
  if (expiryDate <= horizon) return "approaching";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assetTagOf(assets: any): string {
  if (!assets) return "unknown asset";
  return Array.isArray(assets) ? (assets[0]?.asset_tag ?? "unknown asset") : assets.asset_tag;
}

export type ComplianceEscalationEvent = {
  recordType: "certificate" | "warranty";
  recordId: string;
  assetTag: string;
  label: string;
  expiryDate: string;
  eventType: "approaching" | "expired";
  alertId: string;
};

export type ComplianceCheckResult = {
  leadDays: number;
  checked: number;
  escalated: ComplianceEscalationEvent[];
  skipped: number;
};

export async function runComplianceCheck(): Promise<ComplianceCheckResult> {
  const supabase = createServiceRoleClient();
  const leadDays = Number(process.env.COMPLIANCE_LEAD_DAYS) || DEFAULT_LEAD_DAYS;
  const today = todayIsoDate();
  const horizon = addDaysIso(today, leadDays);

  const [{ data: certs, error: certsError }, { data: assets, error: assetsError }] =
    await Promise.all([
      supabase
        .from("compliance_certificates")
        .select("id, certificate_type, expiry_date, asset_id, assets(asset_tag, status)")
        .not("expiry_date", "is", null),
      supabase
        .from("assets")
        .select("id, asset_tag, warranty_end_date, status")
        .not("warranty_end_date", "is", null),
    ]);

  if (certsError) {
    throw new Error(`Failed to load certificates: ${certsError.message}`);
  }
  if (assetsError) {
    throw new Error(`Failed to load asset warranties: ${assetsError.message}`);
  }

  const escalated: ComplianceEscalationEvent[] = [];
  let skipped = 0;
  let checked = 0;

  for (const cert of certs ?? []) {
    checked++;
    // Retired equipment doesn't need a renewal reminder — same reasoning
    // runPmAutoCheck() uses to skip unserviceable assets.
    if (assetStatusOf(cert.assets) === "unserviceable") continue;

    const level = classify(cert.expiry_date, today, horizon);
    if (!level) continue;

    const applied = await tryEscalate(supabase, {
      recordType: "certificate",
      recordId: cert.id,
      assetId: cert.asset_id,
      assetTag: assetTagOf(cert.assets),
      label: cert.certificate_type ?? "Certificate",
      expiryDate: cert.expiry_date,
      level,
      leadDays,
    });
    if (applied) escalated.push(applied);
    else skipped++;
  }

  for (const asset of assets ?? []) {
    checked++;
    if (asset.status === "unserviceable") continue;

    const level = classify(asset.warranty_end_date as string, today, horizon);
    if (!level) continue;

    const applied = await tryEscalate(supabase, {
      recordType: "warranty",
      recordId: asset.id,
      assetId: asset.id,
      assetTag: asset.asset_tag,
      label: "Warranty",
      expiryDate: asset.warranty_end_date as string,
      level,
      leadDays,
    });
    if (applied) escalated.push(applied);
    else skipped++;
  }

  return { leadDays, checked, escalated, skipped };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assetStatusOf(assets: any): string | undefined {
  return Array.isArray(assets) ? assets[0]?.status : assets?.status;
}

async function tryEscalate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: {
    recordType: "certificate" | "warranty";
    recordId: string;
    assetId: string;
    assetTag: string;
    label: string;
    expiryDate: string;
    level: "approaching" | "expired";
    leadDays: number;
  },
): Promise<ComplianceEscalationEvent | null> {
  const { recordType, recordId, assetId, assetTag, label, expiryDate, level, leadDays } = opts;

  // Idempotency check — the unique(record_type, record_id, event_type)
  // constraint on compliance_escalations is the real guarantee; checking
  // first just avoids a needless insert-and-fail round trip on every run.
  const { data: existing } = await supabase
    .from("compliance_escalations")
    .select("id")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .eq("event_type", level)
    .maybeSingle();
  if (existing) return null;

  const title =
    level === "expired"
      ? `${label} expired — ${assetTag}`
      : `${label} expiring soon — ${assetTag}`;
  const description =
    level === "expired"
      ? `${label} for ${assetTag} expired on ${expiryDate}.`
      : `${label} for ${assetTag} expires ${expiryDate} — within the ${leadDays}-day lookahead window.`;

  const { data: alert, error: alertError } = await supabase
    .from("alerts")
    .insert({
      asset_id: assetId,
      title,
      description,
      severity: level === "expired" ? "critical" : "caution",
      created_by: null,
    })
    .select("id")
    .single();
  if (alertError || !alert) {
    throw new Error(alertError?.message ?? "alert insert returned no row");
  }

  const { error: escalationError } = await supabase.from("compliance_escalations").insert({
    record_type: recordType,
    record_id: recordId,
    event_type: level,
    alert_id: alert.id,
  });
  if (escalationError) {
    throw new Error(escalationError.message);
  }

  return {
    recordType,
    recordId,
    assetTag,
    label,
    expiryDate,
    eventType: level,
    alertId: alert.id,
  };
}
