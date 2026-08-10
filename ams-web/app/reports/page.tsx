import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";

const PM_TYPES = [
  "preventive_maintenance",
  "calibration",
  "radiation_survey",
  "water_quality_test",
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { report?: string; report_id?: string; error?: string };
}) {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);

  // No requireStaff() gate — Reports is client-visible in the reference
  // too (it's not in the reference's clientHidden nav list, same check I
  // did before building Calendar). RLS on assets/service_tickets/
  // service_records already scopes a client_viewer to their own org.
  const [{ data: assets }, { data: tickets }, { data: records }] =
    await Promise.all([
      supabase.from("assets").select("id, status"),
      supabase
        .from("service_tickets")
        .select(
          "id, status, priority, description, created_at, resolved_at, assets(serial_number, sites(address))",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("service_records")
        .select(
          "id, service_type, date_performed, performed_by, result, downtime_hours, assets(serial_number, sites(address), organizations(name))",
        )
        .order("date_performed", { ascending: false }),
    ]);

  const totalAssets = assets?.length ?? 0;
  const downAssets =
    assets?.filter((a) => a.status !== "operational").length ?? 0;
  const operationalAssets = totalAssets - downAssets;
  const uptime = totalAssets ? (operationalAssets / totalAssets) * 100 : 0;

  const openTickets =
    tickets?.filter((t) => t.status !== "closed").length ?? 0;
  const resolvedTickets =
    tickets?.filter((t) => t.status === "closed").length ?? 0;
  const resolutionHours = (tickets ?? [])
    .filter((t) => t.resolved_at)
    .map(
      (t) =>
        (new Date(t.resolved_at as string).getTime() -
          new Date(t.created_at).getTime()) /
        3600000,
    )
    .filter((h) => h > 0);
  const avgResolutionHrs = resolutionHours.length
    ? resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length
    : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pmRecords = (records ?? []).filter((r: any) =>
    PM_TYPES.includes(r.service_type),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmRecords = (records ?? []).filter(
    (r: any) => r.service_type === "repair",
  );

  return (
    <AppShell
      profile={profile}
      title="Reports & Compliance"
      subtitle="Fleet health, service performance, and maintenance history."
    >
      {searchParams?.report === "submitted" && (
        <p className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          <span>Service report submitted.</span>
          {searchParams.report_id && (
            <a
              href={`/api/reports/service-records/${searchParams.report_id}/pdf`}
              className="whitespace-nowrap rounded-md border border-emerald-500/40 px-2 py-1 text-xs hover:bg-emerald-500/10"
            >
              Download PDF
            </a>
          )}
        </p>
      )}
      {searchParams?.error && (
        <p className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          {searchParams.error}
        </p>
      )}

      <section className="mb-8">
        <SectionHeader
          kicker="Executive Summary"
          title="Equipment Health Overview"
          hint="Live snapshot of your deployed fleet"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Active Assets"
            value={String(totalAssets)}
            sub="Deployed across all sites"
          />
          <KpiCard
            label="Operational Uptime"
            value={`${uptime.toFixed(1)}%`}
            sub={`${operationalAssets}/${totalAssets} online`}
            tone="green"
          />
          <KpiCard
            label="Operational"
            value={String(operationalAssets)}
            sub="Running normally"
            tone="green"
          />
          <KpiCard
            label="Needs Attention"
            value={String(downAssets)}
            sub={
              downAssets ? "Attention / down / unserviceable" : "No issues detected"
            }
            tone={downAssets ? "red" : "green"}
          />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeader
          kicker="Service Performance"
          title="Service Ticket Summary"
          hint="Recent resolution activity and open workload"
        />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Open Tickets"
            value={String(openTickets)}
            sub="Awaiting resolution"
            tone={openTickets ? "amber" : "green"}
          />
          <KpiCard
            label="Closed (Total)"
            value={String(resolvedTickets)}
            sub="Successfully closed"
            tone="green"
          />
          <KpiCard
            label="Avg. Resolution Time"
            value={avgResolutionHrs ? `${avgResolutionHrs.toFixed(1)}h` : "—"}
            sub="Across resolved tickets"
          />
        </div>
        <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <h3 className="text-sm font-semibold text-ink">
              Recent Service Tickets
            </h3>
            <a
              href="/api/reports/tickets/export"
              className="text-sm text-blue-400 hover:underline"
            >
              Export CSV
            </a>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(tickets ?? []).slice(0, 8).map((t: any) => (
                <tr key={t.id} className="border-t border-hairline">
                  <td className="px-4 py-3 text-ink-soft">
                    {t.assets?.sites?.address ?? "—"}
                    {t.assets?.serial_number
                      ? ` · SN ${t.assets.serial_number}`
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(tickets ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No service tickets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <SectionHeader
          kicker="Maintenance & Compliance"
          title="Exportable Report Logs"
          hint="Audit-ready records of preventive and corrective service"
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HistoryCard
            title="Preventive Maintenance"
            records={pmRecords}
            exportHref="/api/reports/service-records/export?type=preventive"
          />
          <HistoryCard
            title="Corrective Maintenance"
            records={cmRecords}
            exportHref="/api/reports/service-records/export?type=corrective"
          />
        </div>
      </section>

      {isStaff && (
        <section>
          <SectionHeader
            kicker="Digital Forms"
            title="Issue New Report"
            hint="Standard PH TEK service report templates"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TemplateCard
              title="Preventive Maintenance Report"
              subtitle="Scheduled service · checklist"
              href="/reports/preventive-checklist"
            />
            <TemplateCard
              title="Corrective Maintenance Report"
              subtitle="Fault response · repair record"
              href="/reports/corrective-checklist"
            />
          </div>
        </section>
      )}
    </AppShell>
  );
}

function SectionHeader({
  kicker,
  title,
  hint,
}: {
  kicker: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">
        {kicker}
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "blue",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "blue" | "green" | "red" | "amber";
}) {
  const toneClass = {
    blue: "text-blue-400",
    green: "text-emerald-400",
    red: "text-red-400",
    amber: "text-amber-400",
  }[tone];
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold ${toneClass}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function HistoryCard({
  title,
  records,
  exportHref,
}: {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  records: any[];
  exportHref: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-xs text-slate-500">
            {records.length} total records
          </p>
        </div>
        <a
          href={exportHref}
          className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-2"
        >
          Export CSV
        </a>
      </div>
      <ul className="divide-y divide-hairline">
        {records.length === 0 && (
          <li className="px-6 py-8 text-center text-sm text-slate-500">
            No records yet.
          </li>
        )}
        {records.slice(0, 5).map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-4 px-6 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-ink">
                {r.assets?.sites?.address ?? "—"}
                {r.assets?.serial_number ? ` · SN ${r.assets.serial_number}` : ""}
              </div>
              <div className="truncate text-xs text-slate-500">
                {r.assets?.organizations?.name ?? ""}
                {r.performed_by ? ` · ${r.performed_by}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {r.downtime_hours != null && (
                <span className="text-xs text-amber-400">
                  {r.downtime_hours}h down
                </span>
              )}
              <StatusBadge status={r.result ?? "pending"} />
              <span className="text-xs text-slate-500">
                {r.date_performed
                  ? new Date(r.date_performed).toLocaleDateString()
                  : "—"}
              </span>
              <a
                href={`/api/reports/service-records/${r.id}/pdf`}
                className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-soft hover:bg-surface-2"
              >
                PDF
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplateCard({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface p-6">
      <div>
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <Link
        href={href}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
      >
        Open Form
      </Link>
    </div>
  );
}
