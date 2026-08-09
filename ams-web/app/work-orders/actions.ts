"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

// Staff-only end to end — see the note in schema_step9.sql. Unlike
// service_tickets, clients never raise or view work orders; this is the
// internal maintenance-operations queue.
export async function createWorkOrder(formData: FormData) {
  await requireStaff("/work-orders");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const taskTitle = String(formData.get("task_title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const workType = String(formData.get("work_type") ?? "corrective");
  const priority = String(formData.get("priority") ?? "medium");
  const leadTechnician = String(formData.get("lead_technician") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "");

  if (!assetId) {
    redirect(
      `/work-orders/new?error=${encodeURIComponent("Please select an asset.")}`,
    );
  }
  if (!taskTitle) {
    redirect(
      `/work-orders/new?error=${encodeURIComponent("Please enter a task title.")}`,
    );
  }

  const { error } = await supabase.from("work_orders").insert({
    asset_id: assetId,
    task_title: taskTitle,
    description: description || null,
    work_type: workType,
    priority,
    status: "open",
    lead_technician: leadTechnician || null,
    due_date: dueDate || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    redirect(`/work-orders/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/work-orders");
  redirect("/work-orders?created=1");
}

// Called directly from the client-side status <select> in
// work-orders-table.tsx (Next.js allows invoking a "use server" action from
// an event handler, not just a <form action>). No redirect — the table
// re-renders in place via revalidatePath + the client component's own state.
export async function updateWorkOrderStatus(id: string, status: string) {
  await requireStaff("/work-orders");

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/work-orders");
}
