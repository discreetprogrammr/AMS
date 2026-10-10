import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { canViewActivity } from "@/lib/hr-admin-preset";
import { AppShell } from "@/components/app-shell";
import { dateTimeLabel } from "@/lib/format";
import { loadInternalActivity, type ActivityKind } from "@/lib/activity";

// Activity: who added, changed or deleted company equipment, and when. Read
// from the audit trail (lib/activity.ts), narrowed to internal equipment
// only. Staff only.
const KINDS: { value: "all" | ActivityKind; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "added", label: "Added" },
  { value: "changed", label: "Changed" },
  { value: "deleted", label: "Deleted" },
  { value: "file", label: "Files" },
];

const DAYS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const TONE: Record<ActivityKind, string> = {
  added: "bg-emerald-500/15 text-emerald-400",
  changed: "bg-blue-500/15 text-blue-400",
  deleted: "bg-red-500/15 text-red-400",
  file: "bg-slate-500/15 text-ink-soft",
};

const VERB: Record<ActivityKind, string> = { added: "Added", changed: "Changed", deleted: "Deleted", file: "File" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: { type?: string; days?: string; q?: string };
}) {
  await requireStaff();
  const profile = await getProfile();
  // Not every HR & Admin user: Super Admin switches it on per person (User
  // Access). The middleware blocks the URL too; this is the second check.
  if (!canViewActivity(profile?.role, profile?.hidden_modules)) redirect("/dashboard");

  const kind = KINDS.some((k) => k.value === searchParams?.type) ? (searchParams.type as "all" | ActivityKind) : "all";
  const days = DAYS.some((d) => d.value === searchParams?.days) ? (searchParams.days as string) : "30";
  const q = (searchParams?.q ?? "").trim().toLowerCase();

  const { entries, error } = await loadInternalActivity({
    sinceDays: days === "all" ? null : Number(days),
    limit: 500,
  });

  const shown = entries
    .filter((e) => kind === "all" || e.kind === kind)
    .filter(
      (e) => !q || [e.assetTag, e.item, e.who, ...e.lines].some((v) => v.toLowerCase().includes(q)),
    )
    .slice(0, 200);

  const href = (next: { type?: string; days?: string }) => {
    const p = new URLSearchParams();
    const t = next.type ?? kind;
    const d = next.days ?? days;
    if (t !== "all") p.set("type", t);
    if (d !== "30") p.set("days", d);
    if (q) p.set("q", searchParams?.q ?? "");
    const qs = p.toString();
    return `/activity${qs ? `?${qs}` : ""}`;
  };

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-xs font-medium ${
      active ? "border-blue-500 bg-blue-500/15 text-blue-400" : "border-hairline text-ink-soft hover:bg-surface-2"
    }`;

  return (
    <AppShell
      profile={profile}
      title="Activity"
      subtitle="Who added, changed or deleted company equipment, and when."
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link key={k.value} href={href({ type: k.value })} className={chip(kind === k.value)}>
            {k.label}
          </Link>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-hairline sm:block" />
        {DAYS.map((d) => (
          <Link key={d.value} href={href({ days: d.value })} className={chip(days === d.value)}>
            {d.label}
          </Link>
        ))}
        <form action="/activity" className="ml-auto flex gap-2">
          {kind !== "all" && <input type="hidden" name="type" value={kind} />}
          {days !== "30" && <input type="hidden" name="days" value={days} />}
          <input
            name="q"
            defaultValue={searchParams?.q ?? ""}
            placeholder="Search item, person, change…"
            className="h-9 w-60 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none"
          />
          <button type="submit" className="rounded-lg border border-hairline px-3 text-sm text-ink-soft hover:bg-surface-2">
            Search
          </button>
        </form>
      </div>

      <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
        {shown.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm text-ink">
                <span
                  className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE[e.kind]}`}
                >
                  {VERB[e.kind]}
                </span>
                {e.assetId ? (
                  <Link href={`/assets/${e.assetId}`} className="font-medium hover:underline">
                    {e.assetTag || e.item}
                  </Link>
                ) : (
                  <span className="font-medium">{e.assetTag || e.item}</span>
                )}
                {e.assetTag && e.item ? <span className="text-ink-soft"> · {e.item}</span> : null}
              </p>
              <p className="whitespace-nowrap text-xs text-slate-500">
                {e.who} · {dateTimeLabel(e.at)}
              </p>
            </div>
            {e.lines.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                {e.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-slate-500">
            {q || kind !== "all" ? "Nothing matches these filters." : "No activity in this period."}
          </li>
        )}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        Shows up to 200 of the most recent changes. Changes made from the SQL editor or an import script show as
        &quot;System&quot;.
      </p>
    </AppShell>
  );
}
