import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { cycleItemResult, submitInspection } from "../actions";

const RESULT_STYLES: Record<string, { badge: string; label: string }> = {
  pass: {
    badge: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
    label: "PASS",
  },
  attention: {
    badge: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
    label: "ATTENTION",
  },
  fail: {
    badge: "bg-red-500/15 text-red-400 ring-red-500/30",
    label: "FAIL",
  },
};

const CATEGORY_ORDER = [
  "Exterior & Safety",
  "Imaging & Detection",
  "System & Software",
];

export default async function InspectionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const [{ data: inspection }, { data: items }] = await Promise.all([
    supabase
      .from("inspections")
      .select(
        "id, technician_name, inspection_date, status, assets(asset_tag, organizations(name))",
      )
      .eq("id", params.id)
      .single(),
    supabase
      .from("inspection_items")
      .select("id, category, item_name, result")
      .eq("inspection_id", params.id)
      .order("category", { ascending: true })
      .order("item_name", { ascending: true }),
  ]);

  if (!inspection) notFound();

  const allItems = items ?? [];
  const total = allItems.length;
  const passing = allItems.filter((i) => i.result === "pass").length;
  const isDraft = inspection.status === "draft";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asset = inspection.assets as any;
  const orgPrefix = asset?.organizations?.name
    ? `${asset.organizations.name} — `
    : "";
  const subtitle = `${orgPrefix}${asset?.asset_tag ?? "—"} · ${new Date(
    inspection.inspection_date,
  ).toLocaleDateString()}${
    inspection.technician_name ? ` · Tech: ${inspection.technician_name}` : ""
  }`;

  return (
    <AppShell
      profile={profile}
      title="Inspection Checklist"
      subtitle={subtitle}
      actions={
        <>
          <Link
            href="/inspections"
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            ← Back
          </Link>
          {isDraft && (
            <form action={submitInspection.bind(null, inspection.id)}>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
              >
                Submit &amp; Sign Off
              </button>
            </form>
          )}
        </>
      }
    >
      <div className="mb-4 flex items-center justify-between rounded-xl border border-hairline bg-surface p-4">
        <p className="text-sm text-ink-soft">
          <span className="font-semibold text-ink">{passing}</span> of{" "}
          <span className="font-semibold text-ink">{total}</span> passing
        </p>
        <StatusBadge status={inspection.status} />
      </div>

      <p className="mb-4 text-xs text-slate-500">
        {isDraft
          ? "Tap any status to cycle pass → attention → fail."
          : "Signed off — read only. Contact an admin if a correction is needed."}
      </p>

      <div className="space-y-4">
        {CATEGORY_ORDER.map((cat) => {
          const catItems = allItems.filter((i) => i.category === cat);
          if (catItems.length === 0) return null;
          return (
            <div
              key={cat}
              className="overflow-hidden rounded-xl border border-hairline bg-surface"
            >
              <div className="border-b border-hairline px-6 py-3 text-sm font-semibold text-ink">
                {cat}
              </div>
              <div className="divide-y divide-hairline">
                {catItems.map((item) => {
                  const style = RESULT_STYLES[item.result] ?? RESULT_STYLES.pass;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 px-6 py-3"
                    >
                      <div className="flex-1 text-sm text-ink-soft">
                        {item.item_name}
                      </div>
                      {isDraft ? (
                        <form
                          action={cycleItemResult.bind(
                            null,
                            inspection.id,
                            item.id,
                            item.result,
                          )}
                        >
                          <button
                            type="submit"
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ring-1 ring-inset ${style.badge}`}
                          >
                            {style.label}
                          </button>
                        </form>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ring-1 ring-inset ${style.badge}`}
                        >
                          {style.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
