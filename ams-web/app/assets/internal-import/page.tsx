import Link from "next/link";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { InternalImportForm } from "./internal-import-form";

// Bulk import for the company equipment register. The client importer
// (/assets/import) rejects internal rows on purpose; this one is its
// internal counterpart, with the register's own columns.
export default async function InternalImportPage() {
  await requireStaff();
  const profile = await getProfile();

  return (
    <AppShell
      profile={profile}
      title="Import Internal Equipment"
      subtitle="Add many items to the company equipment register from a CSV file."
      actions={
        <Link
          href="/assets"
          className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
        >
          ← Back to Assets
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl">
        <InternalImportForm />
      </div>
    </AppShell>
  );
}
