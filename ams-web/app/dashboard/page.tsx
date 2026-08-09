import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { logout } from "../login/actions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = profile?.role === "internal_staff";

  const [
    { count: totalAssets },
    { count: operationalCount },
    { count: maintenanceCount },
    { count: unserviceableCount },
    { data: expiringCerts, count: expiringCertsCount },
    { data: dueAssets },
    { count: openTickets },
  ] = await Promise.all([
    supabase.from("assets").select("*", { count: "exact", head: true }),
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "operational"),
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "under_maintenance"),
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "unserviceable"),
    supabase
      .from("compliance_certificates")
      .select("id, certificate_type, expiry_date, assets(asset_tag)", {
        count: "exact",
      })
      .lte("expiry_date", daysFromNow(30))
      .order("expiry_date", { ascending: true }),
    supabase
      .from("assets")
      .select("id, asset_tag, next_service_due")
      .not("next_service_due", "is", null)
      .lte("next_service_due", daysFromNow(30))
      .order("next_service_due", { ascending: true }),
    supabase
      .from("service_tickets")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
  ]);

  const operationalPct = totalAssets
    ? Math.round(((operationalCount ?? 0) / totalAssets) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Fleet status across all clients and sites.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/assets"
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            View Assets
          </Link>
          {isStaff && (
            <Link
              href="/inventory"
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              Inventory
            </Link>
          )}
          <form action={logout}>
            <button className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Assets" value={totalAssets ?? 0} />
        <KpiCard label="% Operational" value={`${operationalPct}%`} />
        <KpiCard label="Under Maintenance" value={maintenanceCount ?? 0} />
        <KpiCard
          label="Unserviceable"
          value={unserviceableCount ?? 0}
          tone={unserviceableCount ? "warn" : undefined}
        />
        <KpiCard
          label="Certs Expiring <30d"
          value={expiringCertsCount ?? 0}
          tone={expiringCertsCount ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
            Service Due — Next 30 Days
          </h2>
          {dueAssets?.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {dueAssets.map((a: any) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between py-2"
                >
                  <Link
                    href={`/assets/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.asset_tag}
                  </Link>
                  <span
                    className={
                      a.next_service_due < today()
                        ? "font-medium text-red-600"
                        : "text-slate-500"
                    }
                  >
                    {a.next_service_due}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">
              Nothing due in the next 30 days.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
            Certificates Expiring — Next 30 Days
          </h2>
          {expiringCerts?.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {expiringCerts.map((c: any) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2"
                >
                  <span>
                    {c.assets?.asset_tag ?? "—"} — {c.certificate_type}
                  </span>
                  <span
                    className={
                      c.expiry_date < today()
                        ? "font-medium text-red-600"
                        : "text-slate-500"
                    }
                  >
                    {c.expiry_date}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">
              No certificates expiring soon.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-slate-500">
            Open Service Tickets
          </h2>
          <span className="text-2xl font-semibold">{openTickets ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "warn" ? "text-amber-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
