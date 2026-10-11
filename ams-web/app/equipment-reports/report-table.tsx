import { SEGMENTS, labelFor } from "@/lib/internal-equipment";
import { cost, formatMoney, itemName, statusText, type EquipmentReport } from "@/lib/equipment-report";

const SHORT: Record<string, string> = { pacific_horizon_tek: "PHT", team_fridays_digital: "TFD" };

// The register report as a table, used on screen (theme colours) and on the
// printable page (always white, smaller type). Each group has a heading row
// with its count and total cost, and the end has the grand total.
export function ReportTable({ report, print = false }: { report: EquipmentReport; print?: boolean }) {
  const grouped = report.group !== "none";
  const th = print
    ? "border-b border-slate-400 px-1.5 py-1 text-left text-[9px] font-medium uppercase tracking-wide text-slate-500"
    : "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
  const td = print ? "border-b border-slate-200 px-1.5 py-1 align-top" : "border-t border-hairline px-3 py-2.5 align-top";
  const muted = print ? "text-slate-500" : "text-ink-soft";
  const strong = print ? "font-semibold text-slate-900" : "font-medium text-ink";
  const money = `whitespace-nowrap text-right ${print ? "" : "text-ink"}`;
  const cols = 11;

  return (
    <div className={print ? "" : "overflow-x-auto rounded-xl border border-hairline bg-surface"}>
      <table className={`w-full ${print ? "text-[10px]" : "text-sm"}`}>
        <thead className={print ? "" : "bg-surface-2"}>
          <tr>
            <th className={th}>Asset No.</th>
            <th className={th}>Item</th>
            <th className={th}>Serial</th>
            <th className={th}>Category</th>
            <th className={th}>Custodian</th>
            <th className={th}>Department</th>
            <th className={th}>Segment</th>
            <th className={th}>Status</th>
            <th className={th}>Acquired</th>
            <th className={`${th} text-right`}>Cost</th>
            <th className={th}>Warranty</th>
          </tr>
        </thead>
        {report.groups.map((g) => (
          <tbody key={g.label || "all"} className={print ? "break-inside-auto" : ""}>
            {grouped && (
              <tr className={print ? "bg-slate-100" : "bg-surface-2"}>
                <td colSpan={cols - 2} className={`${td} ${strong}`}>
                  {g.label} <span className={`font-normal ${muted}`}>· {g.rows.length} item{g.rows.length === 1 ? "" : "s"}</span>
                </td>
                <td className={`${td} ${money} ${strong}`}>{formatMoney(g.cost)}</td>
                <td className={td} />
              </tr>
            )}
            {g.rows.map((r) => (
              <tr key={r.id} className={print ? "break-inside-avoid" : ""}>
                <td className={`${td} whitespace-nowrap font-mono ${strong}`}>{r.asset_tag}</td>
                <td className={td}>
                  <span className={strong}>{itemName(r)}</span>
                  {r.description && (r.brand || r.model) ? (
                    <span className={`block ${muted}`}>{[r.brand, r.model].filter(Boolean).join(" ")}</span>
                  ) : null}
                </td>
                <td className={`${td} ${muted}`}>{r.serial_number ?? "—"}</td>
                <td className={`${td} ${muted}`}>{r.asset_category ?? "—"}</td>
                <td className={`${td} ${muted}`}>{r.custodian ?? "—"}</td>
                <td className={`${td} ${muted}`}>{r.department ?? "—"}</td>
                <td className={`${td} ${muted}`} title={labelFor(SEGMENTS, r.segment)}>
                  {SHORT[r.segment ?? ""] ?? "—"}
                </td>
                <td className={`${td} ${muted}`}>{statusText(r)}</td>
                <td className={`${td} ${muted} whitespace-nowrap`}>{r.date_acquired ?? "—"}</td>
                <td className={`${td} ${money}`}>{r.acquisition_cost === null ? "—" : formatMoney(cost(r.acquisition_cost))}</td>
                <td className={`${td} ${muted} whitespace-nowrap`}>{r.warranty_end_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr className={print ? "bg-slate-100" : "bg-surface-2"}>
            <td colSpan={cols - 2} className={`${td} ${strong}`}>
              Total · {report.items} item{report.items === 1 ? "" : "s"}
            </td>
            <td className={`${td} ${money} ${strong}`}>{formatMoney(report.cost)}</td>
            <td className={td} />
          </tr>
        </tfoot>
        {report.items === 0 && (
          <tbody>
            <tr>
              <td colSpan={cols} className={`${td} py-8 text-center ${muted}`}>
                No equipment matches these filters.
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
