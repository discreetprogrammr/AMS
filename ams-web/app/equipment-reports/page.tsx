import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { INTERNAL_CATEGORIES, INTERNAL_DEPARTMENTS, NONE, SEGMENTS, UNASSIGNED } from "@/lib/internal-equipment";
import { getInternalOrgIds } from "@/lib/internal-org";
import { loadCustodianNames } from "@/app/assets/custodian-names";
import { GROUPS, REPORT_STATUSES, formatMoney, loadEquipmentReport } from "@/lib/equipment-report";
import { ReportTable } from "./report-table";

// Reports (HR & Admin tab): the equipment register as a report. Choose what to
// include and how to group it, read it here, print it (save as PDF) or
// download it as a spreadsheet. Internal equipment only. Shows acquisition
// costs and totals, as chosen.
export default async function EquipmentReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireStaff();
  const profile = await getProfile();
  const supabase = await createClient();
  const report = await loadEquipmentReport(supabase, searchParams);
  // Everyone who holds or has held internal equipment, people who left included:
  // a report on an old handover should still be able to find them.
  const custodianNames = await loadCustodianNames(supabase, await getInternalOrgIds(supabase), report.custodian, true);

  const qs = new URLSearchParams();
  if (report.filters.segment) qs.set("segment", report.filters.segment);
  if (report.filters.department) qs.set("department", report.filters.department);
  if (report.filters.category) qs.set("category", report.filters.category);
  if (report.custodian) qs.set("custodian", report.custodian);
  if (report.statusParam !== "all") qs.set("status", report.statusParam);
  if (report.group !== "none") qs.set("group", report.group);
  const query = qs.toString() ? `?${qs.toString()}` : "";

  const select =
    "h-10 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none";
  const label = "flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-500";

  return (
    <AppShell
      profile={profile}
      title="Reports"
      subtitle="The equipment register as a report: filter it, group it, print it or download it."
    >
      <form action="/equipment-reports" className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-hairline bg-surface p-4 lg:grid-cols-4 xl:grid-cols-7">
        <label className={label}>
          Segment
          <select name="segment" defaultValue={report.filters.segment} className={select}>
            <option value="">All segments</option>
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Department
          <select name="department" defaultValue={report.filters.department} className={select}>
            <option value="">All departments</option>
            {INTERNAL_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value={NONE}>Not set</option>
          </select>
        </label>
        <label className={label}>
          Category
          <select name="category" defaultValue={report.filters.category} className={select}>
            <option value="">All categories</option>
            {INTERNAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NONE}>Not set</option>
          </select>
        </label>
        <label className={label}>
          Custodian
          <select name="custodian" defaultValue={report.custodian} className={select}>
            <option value="">Everyone</option>
            <option value={UNASSIGNED}>No custodian</option>
            {custodianNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Status
          <select name="status" defaultValue={report.statusParam} className={select}>
            {REPORT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Group by
          <select name="group" defaultValue={report.group} className={select}>
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-ink hover:bg-blue-500">
            Show report
          </button>
          <Link href="/equipment-reports" className="flex h-10 items-center px-2 text-sm text-ink-soft hover:underline">
            Reset
          </Link>
        </div>
      </form>

      {report.error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{report.error}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{report.description}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/equipment-reports/print${query}`}
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Print / Save as PDF
          </Link>
          <a
            href={`/api/assets/export/register${query}`}
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Download CSV
          </a>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Items</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{report.items}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total acquisition cost</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{formatMoney(report.cost)}</p>
        </div>
        {report.group !== "none" && (
          <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Groups</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{report.groups.length}</p>
          </div>
        )}
      </div>

      <ReportTable report={report} />
      <p className="mt-3 text-xs text-slate-500">
        Cost totals add up each item&apos;s acquisition cost as entered; items with no cost count as zero. Assembly
        records (such as the Desktop PC) are left out so the counts match the spreadsheet.
      </p>
    </AppShell>
  );
}
