import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ticketRef } from "@/lib/format";
import { createWorkOrder } from "../actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: { error?: string; ticket_id?: string };
}) {
  await requireStaff("/work-orders");
  const profile = await getProfile();

  const supabase = await createClient();

  // Spawned from a ticket's "Create Work Order" link (see app/tickets and
  // app/assets/[id]) — pre-fill asset/description/priority from it, and
  // carry ticket_id through as a hidden field so createWorkOrder can link
  // the two records back together (schema_step16.sql).
  const ticketId = searchParams?.ticket_id ?? null;
  const { data: ticketData } = ticketId
    ? await supabase
        .from("service_tickets")
        .select(
          "id, asset_id, description, priority, assets(serial_number, sites(address))",
        )
        .eq("id", ticketId)
        .single()
    : { data: null };
  // Supabase's client-side type inference can't tell this join resolves to
  // a single object (not an array) without generated DB types — same `any`
  // cast used throughout app/** for nested joins; the runtime shape is
  // correct either way, this only affects the type checker.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket = ticketData as any;

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, serial_number, sites(address), organizations(name)")
    .order("asset_tag");

  // Landed here from the plain "+ Create Work Order" button on /work-orders
  // (not from a specific ticket's link) — still offer a way to link one.
  // Only still-open tickets (not yet closed) that aren't already linked to a
  // work order are worth showing here.
  const { data: linkableTickets } = ticketId
    ? { data: null }
    : await supabase
        .from("service_tickets")
        .select(
          "id, description, priority, created_at, assets(serial_number, sites(address))",
        )
        .is("work_order_id", null)
        .neq("status", "closed")
        .order("created_at", { ascending: false });

  return (
    <AppShell profile={profile} title="Create Work Order">
      <div className="mx-auto max-w-xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        {ticket && (
          <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-300">
            Creating from ticket {ticketRef(ticket.id)}
            {ticket.assets?.sites?.address
              ? ` at ${ticket.assets.sites.address}`
              : ""}
            {ticket.assets?.serial_number
              ? ` · SN ${ticket.assets.serial_number}`
              : ""}{" "}
            —{" "}
            <Link
              href={`/assets/${ticket.asset_id}`}
              className="underline hover:text-blue-200"
            >
              view ticket
            </Link>
            . Submitting will link them and move the ticket to In Progress.
          </p>
        )}

        <form
          action={createWorkOrder}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          {ticketId ? (
            <input type="hidden" name="ticket_id" value={ticketId} />
          ) : (
            linkableTickets &&
            linkableTickets.length > 0 && (
              <div>
                <label className={labelClass}>Link to Ticket (optional)</label>
                <select name="ticket_id" defaultValue="" className={inputClass}>
                  <option value="">— None —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {linkableTickets.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {[ticketRef(t.id), t.assets?.sites?.address]
                        .filter(Boolean)
                        .join(" — ")}
                      {t.assets?.serial_number
                        ? ` · SN ${t.assets.serial_number}`
                        : ""}{" "}
                      — {(t.description ?? "").slice(0, 60)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Picking one moves that ticket to In Progress and links it
                  to this work order once created.
                </p>
              </div>
            )
          )}

          <div>
            <label className={labelClass}>Asset</label>
            <select
              name="asset_id"
              required
              defaultValue={ticket?.asset_id ?? ""}
              className={inputClass}
            >
              <option value="" disabled>
                Select asset…
              </option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(assets ?? []).map((asset: any) => (
                <option key={asset.id} value={asset.id}>
                  {[asset.organizations?.name, asset.sites?.address]
                    .filter(Boolean)
                    .join(" — ")}
                  {asset.serial_number ? ` · SN ${asset.serial_number}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Task Title</label>
            <input
              name="task_title"
              required
              placeholder="e.g. Calibration Service"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              name="description"
              rows={3}
              defaultValue={ticket?.description ?? ""}
              placeholder="Additional detail for the assigned technician…"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Work Type</label>
              <select
                name="work_type"
                defaultValue="corrective"
                className={inputClass}
              >
                <option value="preventive">Preventive</option>
                <option value="corrective">Corrective</option>
                <option value="inspection">Inspection</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <select
                name="priority"
                defaultValue={ticket?.priority ?? "medium"}
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Lead Technician</label>
              <input name="lead_technician" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Due Date</label>
              <input type="date" name="due_date" className={inputClass} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Create Work Order
            </button>
            <Link
              href="/work-orders"
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
