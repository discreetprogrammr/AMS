import Link from "next/link";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { createOrganization } from "../actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/clients");
  const profile = await getProfile();

  return (
    <AppShell profile={profile} title="Add Client">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form
          action={createOrganization}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          <div>
            <label className={labelClass}>Client Name</label>
            <input name="name" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Sector</label>
            <input
              name="sector"
              placeholder="Customs, Aviation, Government, Hotel, Security…"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Primary Contact</label>
            <input name="primary_contact" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input name="email" type="email" className={inputClass} />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Add Client
            </button>
            <Link
              href="/clients"
              className="rounded-lg border border-hairline px-5 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
