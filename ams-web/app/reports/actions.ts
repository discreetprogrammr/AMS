"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { generateAndStoreReportPdf } from "@/lib/pdf/generate-and-store";

export type ChecklistItemInput = {
  section: string;
  item_label: string;
  status: "ok" | "attention" | "fail";
  remarks: string;
};

// Staff-only. This is the actual mechanism for logging a preventive
// maintenance visit against an asset — service_records has existed since
// Step 1 but never had a UI to create a row until this form.
export async function createPreventiveReport(formData: FormData) {
  await requireStaff("/reports");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const ticketId = String(formData.get("ticket_id") ?? "").trim() || null;
  const datePerformed = String(formData.get("date_performed") ?? "");
  const performedBy = String(formData.get("performed_by") ?? "").trim();
  const nextDueDate = String(formData.get("next_due_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsRaw = String(formData.get("items") ?? "[]");
  const survey = readSurveyAndSignOff(formData);
  const timing = readServiceTiming(formData);

  if (!assetId) {
    redirect(
      `/reports/preventive-checklist?error=${encodeURIComponent("Please select an asset.")}`,
    );
  }
  if (!datePerformed) {
    redirect(
      `/reports/preventive-checklist?error=${encodeURIComponent("Please enter the service date.")}`,
    );
  }

  let items: ChecklistItemInput[] = [];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    items = [];
  }

  const failCount = items.filter((i) => i.status === "fail").length;
  const attentionCount = items.filter((i) => i.status === "attention").length;
  const result = failCount > 0 ? "fail" : "pass";
  const summary = [
    failCount ? `${failCount} item(s) failed` : null,
    attentionCount ? `${attentionCount} item(s) need attention` : null,
    notes || null,
  ]
    .filter(Boolean)
    .join(" — ");

  const { data: record, error } = await supabase
    .from("service_records")
    .insert({
      asset_id: assetId,
      ticket_id: ticketId,
      service_type: "preventive_maintenance",
      date_performed: datePerformed,
      performed_by: performedBy || null,
      findings: summary || null,
      result,
      next_due_date: nextDueDate || null,
      created_by: user?.id ?? null,
      ...survey,
      ...timing,
    })
    .select("id")
    .single();

  if (error || !record) {
    redirect(
      `/reports/preventive-checklist?error=${encodeURIComponent(error?.message ?? "Could not save report.")}`,
    );
    return;
  }

  if (items.length > 0) {
    const rows = items.map((i) => ({
      service_record_id: record.id,
      section: i.section,
      item_label: i.item_label,
      status: i.status,
      remarks: i.remarks || null,
    }));
    await supabase.from("service_record_checklist_items").insert(rows);
  }

  const pdfResult = await generateAndStoreReportPdf(supabase, {
    recordId: record.id,
    assetId,
    siteId: null,
    reportKind: "pm",
    datePerformed,
    performedBy: performedBy || null,
    findings: summary || null,
    result,
    nextDueDate: nextDueDate || null,
    downtimeHours: null,
    csatService: survey.csat_service,
    csatMachine: survey.csat_machine,
    csatSupport: survey.csat_support,
    csatOverall: survey.csat_overall,
    customerSignatory: survey.customer_signatory,
    technicianSignature: survey.technician_signature,
    customerSignature: survey.customer_signature,
    timeArrived: timing.time_arrived,
    serviceBegin: timing.service_begin,
    serviceCompleted: timing.service_completed,
    visitStatus: timing.visit_status,
    diagnosticStart: timing.diagnostic_start,
    diagnosticDone: timing.diagnostic_done,
    repairStart: timing.repair_start,
    repairEnd: timing.repair_end,
    checklistItems: items.map((i) => ({
      section: i.section,
      item_label: i.item_label,
      status: i.status,
      remarks: i.remarks || null,
    })),
    parts: [],
    radiationReadings: [],
    surveyMeterModel: null,
    surveyMeterSerial: null,
    surveyMeterCalibrationDate: null,
    reportReferenceNo: null,
    trainingAttendees: null,
  });

  revalidatePath("/reports");
  revalidatePath(`/assets/${assetId}`);
  if (ticketId) revalidatePath("/tickets");

  if (!pdfResult.ok) {
    redirect(
      `/reports?report=submitted&report_id=${record.id}&error=${encodeURIComponent(
        `Report saved, but the PDF couldn't be generated: ${pdfResult.message} (have you run schema_step20.sql?).`,
      )}`,
    );
  }

  redirect(`/reports?report=submitted&report_id=${record.id}`);
}

// Staff-only. The reference's corrective report doesn't use a checklist
// grid either — free-text fault/root-cause/action fields, same as here.
export async function createCorrectiveReport(formData: FormData) {
  await requireStaff("/reports");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const ticketId = String(formData.get("ticket_id") ?? "").trim() || null;
  const datePerformed = String(formData.get("date_performed") ?? "");
  const performedBy = String(formData.get("performed_by") ?? "").trim();
  const faultDescription = String(formData.get("fault_description") ?? "").trim();
  const rootCause = String(formData.get("root_cause") ?? "").trim();
  const correctiveAction = String(formData.get("corrective_action") ?? "").trim();
  const partsReplaced = String(formData.get("parts_replaced") ?? "").trim();
  const downtimeHours = String(formData.get("downtime_hours") ?? "");
  const result = String(formData.get("result") ?? "pass");
  const comments = String(formData.get("notes") ?? "").trim();
  const survey = readSurveyAndSignOff(formData);
  const timing = readServiceTiming(formData);

  if (!assetId) {
    redirect(
      `/reports/corrective-checklist?error=${encodeURIComponent("Please select an asset.")}`,
    );
  }
  if (!datePerformed) {
    redirect(
      `/reports/corrective-checklist?error=${encodeURIComponent("Please enter the service date.")}`,
    );
  }
  if (!faultDescription) {
    redirect(
      `/reports/corrective-checklist?error=${encodeURIComponent("Please describe the fault.")}`,
    );
  }

  const findings = [
    `Fault: ${faultDescription}`,
    rootCause ? `Root cause: ${rootCause}` : null,
    correctiveAction ? `Action taken: ${correctiveAction}` : null,
    comments ? `Comments: ${comments}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: record, error } = await supabase
    .from("service_records")
    .insert({
      asset_id: assetId,
      ticket_id: ticketId,
      service_type: "repair",
      date_performed: datePerformed,
      performed_by: performedBy || null,
      findings,
      result,
      downtime_hours: downtimeHours ? Number(downtimeHours) : null,
      created_by: user?.id ?? null,
      ...survey,
      ...timing,
    })
    .select("id")
    .single();

  if (error || !record) {
    redirect(
      `/reports/corrective-checklist?error=${encodeURIComponent(error?.message ?? "Could not save report.")}`,
    );
    return;
  }

  const partRows: { part_name: string; quantity: number; status: string }[] = [];
  if (partsReplaced) {
    const partNames = partsReplaced
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (partNames.length > 0) {
      const rows = partNames.map((name) => ({
        service_record_id: record.id,
        part_name: name,
        status: "used" as const,
      }));
      partRows.push(...rows.map((r) => ({ part_name: r.part_name, quantity: 1, status: r.status })));
      await supabase.from("service_record_parts").insert(rows);
    }
  }

  const pdfResult = await generateAndStoreReportPdf(supabase, {
    recordId: record.id,
    assetId,
    siteId: null,
    reportKind: "cm",
    datePerformed,
    performedBy: performedBy || null,
    findings,
    result,
    nextDueDate: null,
    downtimeHours: downtimeHours ? Number(downtimeHours) : null,
    csatService: survey.csat_service,
    csatMachine: survey.csat_machine,
    csatSupport: survey.csat_support,
    csatOverall: survey.csat_overall,
    customerSignatory: survey.customer_signatory,
    technicianSignature: survey.technician_signature,
    customerSignature: survey.customer_signature,
    timeArrived: timing.time_arrived,
    serviceBegin: timing.service_begin,
    serviceCompleted: timing.service_completed,
    visitStatus: timing.visit_status,
    diagnosticStart: timing.diagnostic_start,
    diagnosticDone: timing.diagnostic_done,
    repairStart: timing.repair_start,
    repairEnd: timing.repair_end,
    checklistItems: [],
    parts: partRows,
    radiationReadings: [],
    surveyMeterModel: null,
    surveyMeterSerial: null,
    surveyMeterCalibrationDate: null,
    reportReferenceNo: null,
    trainingAttendees: null,
  });

  revalidatePath("/reports");
  revalidatePath(`/assets/${assetId}`);
  if (ticketId) revalidatePath("/tickets");

  if (!pdfResult.ok) {
    redirect(
      `/reports?report=submitted&report_id=${record.id}&error=${encodeURIComponent(
        `Report saved, but the PDF couldn't be generated: ${pdfResult.message} (have you run schema_step20.sql?).`,
      )}`,
    );
  }

  redirect(`/reports?report=submitted&report_id=${record.id}`);
}

// Staff-only. Installation Report (schema_step41.sql) — logs a newly
// installed unit's commissioning visit. Asset-scoped like PM/CM (the unit
// must already exist as an asset record before you can file this).
export async function createInstallationReport(formData: FormData) {
  await requireStaff("/reports");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const datePerformed = String(formData.get("date_performed") ?? "");
  const performedBy = String(formData.get("performed_by") ?? "").trim();
  const nextDueDate = String(formData.get("next_due_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const result = String(formData.get("result") ?? "pass");
  const survey = readSurveyAndSignOff(formData);
  const timing = readServiceTiming(formData);

  if (!assetId) {
    redirect(`/reports/installation?error=${encodeURIComponent("Please select the installed asset.")}`);
  }
  if (!datePerformed) {
    redirect(`/reports/installation?error=${encodeURIComponent("Please enter the installation date.")}`);
  }

  const { data: record, error } = await supabase
    .from("service_records")
    .insert({
      asset_id: assetId,
      service_type: "installation",
      date_performed: datePerformed,
      performed_by: performedBy || null,
      findings: notes || null,
      result,
      next_due_date: nextDueDate || null,
      created_by: user?.id ?? null,
      ...survey,
      ...timing,
    })
    .select("id")
    .single();

  if (error || !record) {
    redirect(`/reports/installation?error=${encodeURIComponent(error?.message ?? "Could not save report.")}`);
    return;
  }

  const pdfResult = await generateAndStoreReportPdf(supabase, {
    recordId: record.id,
    assetId,
    siteId: null,
    reportKind: "installation",
    datePerformed,
    performedBy: performedBy || null,
    findings: notes || null,
    result,
    nextDueDate: nextDueDate || null,
    downtimeHours: null,
    csatService: survey.csat_service,
    csatMachine: survey.csat_machine,
    csatSupport: survey.csat_support,
    csatOverall: survey.csat_overall,
    customerSignatory: survey.customer_signatory,
    technicianSignature: survey.technician_signature,
    customerSignature: survey.customer_signature,
    timeArrived: timing.time_arrived,
    serviceBegin: timing.service_begin,
    serviceCompleted: timing.service_completed,
    visitStatus: timing.visit_status,
    diagnosticStart: timing.diagnostic_start,
    diagnosticDone: timing.diagnostic_done,
    repairStart: timing.repair_start,
    repairEnd: timing.repair_end,
    checklistItems: [],
    parts: [],
    radiationReadings: [],
    surveyMeterModel: null,
    surveyMeterSerial: null,
    surveyMeterCalibrationDate: null,
    reportReferenceNo: null,
    trainingAttendees: null,
  });

  revalidatePath("/reports");
  revalidatePath(`/assets/${assetId}`);

  if (!pdfResult.ok) {
    redirect(
      `/reports?report=submitted&report_id=${record.id}&error=${encodeURIComponent(
        `Report saved, but the PDF couldn't be generated: ${pdfResult.message}.`,
      )}`,
    );
  }

  redirect(`/reports?report=submitted&report_id=${record.id}`);
}

export type RadiationReadingInput = {
  location: string;
  reading: string;
  unit: string;
  limit: string;
};

// Staff-only. Radiation Survey Test Report (schema_step41.sql) — the PNRI
// compliance survey that accompanies every PM visit on X-ray/radiation-
// emitting equipment. `performed_by` (the surveyor) is required here,
// unlike every other report form, since identifying who performed the
// survey is compliance-critical, not optional metadata.
export async function createRadiationSurveyReport(formData: FormData) {
  await requireStaff("/reports");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const datePerformed = String(formData.get("date_performed") ?? "");
  const performedBy = String(formData.get("performed_by") ?? "").trim();
  const nextDueDate = String(formData.get("next_due_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const result = String(formData.get("result") ?? "pass");
  const surveyMeterModel = String(formData.get("survey_meter_model") ?? "").trim();
  const surveyMeterSerial = String(formData.get("survey_meter_serial") ?? "").trim();
  const surveyMeterCalibrationDate = String(formData.get("survey_meter_calibration_date") ?? "");
  const reportReferenceNo = String(formData.get("report_reference_no") ?? "").trim();
  const readingsRaw = String(formData.get("radiation_readings") ?? "[]");
  const survey = readSurveyAndSignOff(formData);
  const timing = readServiceTiming(formData);

  if (!assetId) {
    redirect(`/reports/radiation-survey?error=${encodeURIComponent("Please select the surveyed asset.")}`);
  }
  if (!datePerformed) {
    redirect(`/reports/radiation-survey?error=${encodeURIComponent("Please enter the survey date.")}`);
  }
  if (!performedBy) {
    redirect(
      `/reports/radiation-survey?error=${encodeURIComponent("Please enter the radiation surveyor's name.")}`,
    );
  }

  let readings: RadiationReadingInput[] = [];
  try {
    readings = JSON.parse(readingsRaw);
  } catch {
    readings = [];
  }
  const cleanReadings = readings.filter((r) => r.location?.trim() || r.reading?.trim());

  const { data: record, error } = await supabase
    .from("service_records")
    .insert({
      asset_id: assetId,
      service_type: "radiation_survey",
      date_performed: datePerformed,
      performed_by: performedBy,
      findings: notes || null,
      result,
      next_due_date: nextDueDate || null,
      radiation_readings: cleanReadings.length > 0 ? cleanReadings : null,
      survey_meter_model: surveyMeterModel || null,
      survey_meter_serial: surveyMeterSerial || null,
      survey_meter_calibration_date: surveyMeterCalibrationDate || null,
      report_reference_no: reportReferenceNo || null,
      created_by: user?.id ?? null,
      ...survey,
      ...timing,
    })
    .select("id")
    .single();

  if (error || !record) {
    redirect(
      `/reports/radiation-survey?error=${encodeURIComponent(error?.message ?? "Could not save report.")}`,
    );
    return;
  }

  const pdfResult = await generateAndStoreReportPdf(supabase, {
    recordId: record.id,
    assetId,
    siteId: null,
    reportKind: "radiation_survey",
    datePerformed,
    performedBy,
    findings: notes || null,
    result,
    nextDueDate: nextDueDate || null,
    downtimeHours: null,
    csatService: survey.csat_service,
    csatMachine: survey.csat_machine,
    csatSupport: survey.csat_support,
    csatOverall: survey.csat_overall,
    customerSignatory: survey.customer_signatory,
    technicianSignature: survey.technician_signature,
    customerSignature: survey.customer_signature,
    timeArrived: timing.time_arrived,
    serviceBegin: timing.service_begin,
    serviceCompleted: timing.service_completed,
    visitStatus: timing.visit_status,
    diagnosticStart: timing.diagnostic_start,
    diagnosticDone: timing.diagnostic_done,
    repairStart: timing.repair_start,
    repairEnd: timing.repair_end,
    checklistItems: [],
    parts: [],
    radiationReadings: cleanReadings,
    surveyMeterModel: surveyMeterModel || null,
    surveyMeterSerial: surveyMeterSerial || null,
    surveyMeterCalibrationDate: surveyMeterCalibrationDate || null,
    reportReferenceNo: reportReferenceNo || null,
    trainingAttendees: null,
  });

  revalidatePath("/reports");
  revalidatePath(`/assets/${assetId}`);

  if (!pdfResult.ok) {
    redirect(
      `/reports?report=submitted&report_id=${record.id}&error=${encodeURIComponent(
        `Report saved, but the PDF couldn't be generated: ${pdfResult.message}.`,
      )}`,
    );
  }

  redirect(`/reports?report=submitted&report_id=${record.id}`);
}

// Staff-only. Site Survey Report (schema_step41.sql) — a pre-installation
// assessment that can legitimately happen before any asset exists at the
// site, so this is site-scoped (site_id required) with an optional asset
// reference rather than asset-scoped like every other report type.
export async function createSiteSurveyReport(formData: FormData) {
  await requireStaff("/reports");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const siteId = String(formData.get("site_id") ?? "");
  const assetId = String(formData.get("asset_id") ?? "").trim() || null;
  const datePerformed = String(formData.get("date_performed") ?? "");
  const performedBy = String(formData.get("performed_by") ?? "").trim();
  const nextDueDate = String(formData.get("next_due_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const result = String(formData.get("result") ?? "").trim() || null;
  const survey = readSurveyAndSignOff(formData);
  const timing = readServiceTiming(formData);

  if (!siteId) {
    redirect(`/reports/site-survey?error=${encodeURIComponent("Please select a site.")}`);
  }
  if (!datePerformed) {
    redirect(`/reports/site-survey?error=${encodeURIComponent("Please enter the survey date.")}`);
  }

  const { data: record, error } = await supabase
    .from("service_records")
    .insert({
      asset_id: assetId,
      site_id: siteId,
      service_type: "site_survey",
      date_performed: datePerformed,
      performed_by: performedBy || null,
      findings: notes || null,
      result,
      next_due_date: nextDueDate || null,
      created_by: user?.id ?? null,
      ...survey,
      ...timing,
    })
    .select("id")
    .single();

  if (error || !record) {
    redirect(`/reports/site-survey?error=${encodeURIComponent(error?.message ?? "Could not save report.")}`);
    return;
  }

  const pdfResult = await generateAndStoreReportPdf(supabase, {
    recordId: record.id,
    assetId,
    siteId,
    reportKind: "site_survey",
    datePerformed,
    performedBy: performedBy || null,
    findings: notes || null,
    result,
    nextDueDate: nextDueDate || null,
    downtimeHours: null,
    csatService: survey.csat_service,
    csatMachine: survey.csat_machine,
    csatSupport: survey.csat_support,
    csatOverall: survey.csat_overall,
    customerSignatory: survey.customer_signatory,
    technicianSignature: survey.technician_signature,
    customerSignature: survey.customer_signature,
    timeArrived: timing.time_arrived,
    serviceBegin: timing.service_begin,
    serviceCompleted: timing.service_completed,
    visitStatus: timing.visit_status,
    diagnosticStart: timing.diagnostic_start,
    diagnosticDone: timing.diagnostic_done,
    repairStart: timing.repair_start,
    repairEnd: timing.repair_end,
    checklistItems: [],
    parts: [],
    radiationReadings: [],
    surveyMeterModel: null,
    surveyMeterSerial: null,
    surveyMeterCalibrationDate: null,
    reportReferenceNo: null,
    trainingAttendees: null,
  });

  revalidatePath("/reports");
  if (assetId) revalidatePath(`/assets/${assetId}`);

  if (!pdfResult.ok) {
    redirect(
      `/reports?report=submitted&report_id=${record.id}&error=${encodeURIComponent(
        `Report saved, but the PDF couldn't be generated: ${pdfResult.message}.`,
      )}`,
    );
  }

  redirect(`/reports?report=submitted&report_id=${record.id}`);
}

// Staff-only. Training Report (schema_step41.sql) — same site-scoped-with-
// optional-asset shape as Site Survey (a general safety/orientation
// session isn't always tied to one specific unit). `result` isn't
// meaningful here (pass/fail doesn't fit a training session) so it's
// always stored null and the form doesn't render an Outcome field at all.
export async function createTrainingReport(formData: FormData) {
  await requireStaff("/reports");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const siteId = String(formData.get("site_id") ?? "");
  const assetId = String(formData.get("asset_id") ?? "").trim() || null;
  const datePerformed = String(formData.get("date_performed") ?? "");
  const performedBy = String(formData.get("performed_by") ?? "").trim();
  const nextDueDate = String(formData.get("next_due_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const attendees = String(formData.get("training_attendees") ?? "").trim();
  const survey = readSurveyAndSignOff(formData);
  const timing = readServiceTiming(formData);

  if (!siteId) {
    redirect(`/reports/training?error=${encodeURIComponent("Please select a site.")}`);
  }
  if (!datePerformed) {
    redirect(`/reports/training?error=${encodeURIComponent("Please enter the training date.")}`);
  }

  const { data: record, error } = await supabase
    .from("service_records")
    .insert({
      asset_id: assetId,
      site_id: siteId,
      service_type: "training",
      date_performed: datePerformed,
      performed_by: performedBy || null,
      findings: notes || null,
      result: null,
      next_due_date: nextDueDate || null,
      training_attendees: attendees || null,
      created_by: user?.id ?? null,
      ...survey,
      ...timing,
    })
    .select("id")
    .single();

  if (error || !record) {
    redirect(`/reports/training?error=${encodeURIComponent(error?.message ?? "Could not save report.")}`);
    return;
  }

  const pdfResult = await generateAndStoreReportPdf(supabase, {
    recordId: record.id,
    assetId,
    siteId,
    reportKind: "training",
    datePerformed,
    performedBy: performedBy || null,
    findings: notes || null,
    result: null,
    nextDueDate: nextDueDate || null,
    downtimeHours: null,
    csatService: survey.csat_service,
    csatMachine: survey.csat_machine,
    csatSupport: survey.csat_support,
    csatOverall: survey.csat_overall,
    customerSignatory: survey.customer_signatory,
    technicianSignature: survey.technician_signature,
    customerSignature: survey.customer_signature,
    timeArrived: timing.time_arrived,
    serviceBegin: timing.service_begin,
    serviceCompleted: timing.service_completed,
    visitStatus: timing.visit_status,
    diagnosticStart: timing.diagnostic_start,
    diagnosticDone: timing.diagnostic_done,
    repairStart: timing.repair_start,
    repairEnd: timing.repair_end,
    checklistItems: [],
    parts: [],
    radiationReadings: [],
    surveyMeterModel: null,
    surveyMeterSerial: null,
    surveyMeterCalibrationDate: null,
    reportReferenceNo: null,
    trainingAttendees: attendees || null,
  });

  revalidatePath("/reports");
  if (assetId) revalidatePath(`/assets/${assetId}`);

  if (!pdfResult.ok) {
    redirect(
      `/reports?report=submitted&report_id=${record.id}&error=${encodeURIComponent(
        `Report saved, but the PDF couldn't be generated: ${pdfResult.message}.`,
      )}`,
    );
  }

  redirect(`/reports?report=submitted&report_id=${record.id}`);
}

// Shared by both report forms — CSAT ratings (schema_step18.sql) plus the
// customer-signatory name and the two signature-pad data URLs, all posted
// as plain form fields by <CustomerSurvey /> and <SignaturePad /> (see
// components/customer-survey.tsx and components/signature-pad.tsx).
function readSurveyAndSignOff(formData: FormData) {
  const rating = (key: string) => {
    const n = Number(formData.get(key) ?? "");
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  };
  const text = (key: string) => String(formData.get(key) ?? "").trim() || null;

  return {
    csat_service: rating("csat_service"),
    csat_machine: rating("csat_machine"),
    csat_support: rating("csat_support"),
    csat_overall: rating("csat_overall"),
    customer_signatory: text("customer_signatory"),
    technician_signature: text("technician_signature"),
    customer_signature: text("customer_signature"),
  };
}

// Shared by both report forms — the "Service Timing" and "If Failures
// Occurred" time fields (schema_step19.sql), posted as plain <input
// type="time"> values (empty string when left blank).
function readServiceTiming(formData: FormData) {
  const time = (key: string) => String(formData.get(key) ?? "").trim() || null;
  return {
    time_arrived: time("time_arrived"),
    service_begin: time("service_begin"),
    service_completed: time("service_completed"),
    visit_status: time("visit_status"),
    diagnostic_start: time("diagnostic_start"),
    diagnostic_done: time("diagnostic_done"),
    repair_start: time("repair_start"),
    repair_end: time("repair_end"),
  };
}
