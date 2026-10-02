import { z } from "zod";
import {
  authorizeFarm,
  requirePlan,
  AccessError,
  apiError,
} from "@/src/lib/access-server";
import {
  completedHours,
  crewEntryHours,
  normalizedField,
  recordReviewProblems,
  scheduledHours,
} from "@/src/lib/ask-farmvoice";
import { collectPages } from "@/src/lib/pagination";

export const runtime = "nodejs";

const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid calendar date.");

const requestSchema = z.object({
  farmId: z.uuid(),
  promptId: z.enum([
    "incomplete_records",
    "pesticide_field",
    "crew_hours",
    "scheduled_vs_actual",
    "h2a_attention",
    "field_activity",
  ]),
  field: z.string().trim().max(120).optional(),
  start: isoDate.optional(),
  end: isoDate.optional(),
}).refine(
  (body) => !body.start || !body.end || body.start <= body.end,
  { message: "Start date must be on or before end date." },
);

function isoStart(value?: string) {
  return value ? value + "T00:00:00.000Z" : null;
}
function isoEnd(value?: string) {
  return value ? value + "T23:59:59.999Z" : null;
}
function dateRangeLabel(start?: string, end?: string) {
  return start || end
    ? [start ?? "earliest", end ?? "today"].join(" through ")
    : "all available records";
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new AccessError(parsed.error.issues[0]?.message ?? "Choose a supported FarmVoice question.", 400);
    const body = parsed.data;
    const { supabase } = await authorizeFarm(body.farmId, true);
    await requirePlan(supabase, body.farmId);

    const start = isoStart(body.start);
    const end = isoEnd(body.end);

    if (body.promptId === "incomplete_records") {
      const records = await collectPages<any>((from, to) => {
        let query = supabase
          .from("farm_records")
          .select("id,record_type,status,payload,created_at")
          .eq("farm_id", body.farmId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        if (start) query = query.gte("created_at", start);
        if (end) query = query.lte("created_at", end);
        return query.range(from, to);
      });
      const rows = records
        .map((row) => ({
          ...row,
          problems: recordReviewProblems(row as never),
        }))
        .filter((row) => row.problems.length);
      return Response.json({
        title: "Farm records needing review",
        answer: rows.length
          ? `${rows.length} record${rows.length === 1 ? "" : "s"} need review in ${dateRangeLabel(body.start, body.end)}.`
          : `No incomplete farm records were found in ${dateRangeLabel(body.start, body.end)}.`,
        rows: rows.slice(0, 100).map((row) => ({
          id: row.id,
          type: row.record_type,
          status: row.status,
          date: row.created_at,
          detail: row.problems.join(", "),
        })),
        note: "FarmVoice identifies missing or unconfirmed record data. It does not determine legal compliance.",
      });
    }

    if (body.promptId === "pesticide_field") {
      if (!body.field) throw new AccessError("Enter a field name.", 400);
      const records = await collectPages<any>((from, to) => {
        let query = supabase
          .from("farm_records")
          .select("id,status,payload,created_at")
          .eq("farm_id", body.farmId)
          .eq("record_type", "pesticide")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        if (start) query = query.gte("created_at", start);
        if (end) query = query.lte("created_at", end);
        return query.range(from, to);
      });
      const target = normalizedField(body.field);
      const rows = records.filter((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        return normalizedField(payload.fieldLocation) === target;
      });
      return Response.json({
        title: `Pesticide applications — ${body.field}`,
        answer: `${rows.length} pesticide application record${rows.length === 1 ? "" : "s"} found for ${body.field}.`,
        rows: rows.slice(0, 100).map((row) => {
          const p = (row.payload ?? {}) as Record<string, unknown>;
          return {
            id: row.id,
            type: "pesticide",
            status: row.status,
            date: String(p.applicationDate ?? row.created_at ?? ""),
            detail: [
              p.productName,
              p.amountApplied && p.amountUnit
                ? `${p.amountApplied} ${p.amountUnit}`
                : null,
            ].filter(Boolean).join(" · "),
          };
        }),
        note: "This is a recordkeeping review, not a legal or compliance determination.",
      });
    }

    if (body.promptId === "crew_hours" || body.promptId === "scheduled_vs_actual") {
      const [timeRows, crewRows] = await Promise.all([
        collectPages<any>((from, to) => {
          let query = supabase
            .from("time_entries")
            .select("id,worker_user_id,job,field_name,clock_in,clock_out,approval_status")
            .eq("farm_id", body.farmId)
            .order("clock_in", { ascending: false })
            .order("id", { ascending: false });
          if (start) query = query.gte("clock_in", start);
          if (end) query = query.lte("clock_in", end);
          return query.range(from, to);
        }),
        collectPages<any>((from, to) => {
          let query = supabase
            .from("crew_time_entries")
            .select("id,clock_in,clock_out,break_minutes,approval_status")
            .eq("farm_id", body.farmId)
            .order("clock_in", { ascending: false })
            .order("id", { ascending: false });
          if (start) query = query.gte("clock_in", start);
          if (end) query = query.lte("clock_in", end);
          return query.range(from, to);
        }),
      ]);
      const individualHours = completedHours(timeRows);
      const onePhoneCrewHours = crewEntryHours(crewRows);
      const actual = individualHours + onePhoneCrewHours;

      if (body.promptId === "crew_hours") {
        return Response.json({
          title: "Crew hours",
          answer: `${actual.toFixed(2)} completed crew hours were recorded in ${dateRangeLabel(body.start, body.end)}.`,
          metrics: [
            { label: "Total completed", value: actual.toFixed(2) },
            { label: "Individual clock", value: individualHours.toFixed(2) },
            { label: "One-phone crew", value: onePhoneCrewHours.toFixed(2) },
          ],
          note: "Open Team to review pending, approved, or rejected entries before payroll export.",
        });
      }

      const shiftRows = await collectPages<any>((from, to) => {
        let query = supabase
          .from("shifts")
          .select("id,starts_at,ends_at")
          .eq("farm_id", body.farmId)
          .order("starts_at", { ascending: false })
          .order("id", { ascending: false });
        if (start) query = query.gte("starts_at", start);
        if (end) query = query.lte("starts_at", end);
        return query.range(from, to);
      });
      const scheduled = scheduledHours(shiftRows);
      return Response.json({
        title: "Scheduled versus actual hours",
        answer: `${scheduled.toFixed(2)} hours scheduled versus ${actual.toFixed(2)} completed hours in ${dateRangeLabel(body.start, body.end)}.`,
        metrics: [
          { label: "Scheduled", value: scheduled.toFixed(2) },
          { label: "Completed", value: actual.toFixed(2) },
          { label: "Difference", value: (actual - scheduled).toFixed(2) },
        ],
      });
    }

    if (body.promptId === "field_activity") {
      if (!body.field) throw new AccessError("Enter a field name.", 400);
      const { data: fields, error: fieldError } = await supabase
        .from("fields")
        .select("id,name,current_crop")
        .eq("farm_id", body.farmId)
        .eq("active", true);
      if (fieldError) throw fieldError;
      const field = (fields ?? []).find(
        (item) => normalizedField(item.name) === normalizedField(body.field),
      );
      if (!field) throw new AccessError("That field was not found on this farm.", 404);

      const events = await collectPages<any>((from, to) => {
        let query = supabase
          .from("field_history_events")
          .select("id,event_type,event_date,summary,created_at")
          .eq("farm_id", body.farmId)
          .eq("field_id", field.id)
          .order("event_date", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false });
        if (body.start) query = query.gte("event_date", body.start);
        if (body.end) query = query.lte("event_date", body.end);
        return query.range(from, to);
      });

      return Response.json({
        title: `Activity — ${field.name}`,
        answer: `${events.length} field-history event${events.length === 1 ? "" : "s"} found for ${field.name}.`,
        metrics: field.current_crop
          ? [{ label: "Current crop", value: field.current_crop }]
          : [],
        rows: events.slice(0, 200).map((event) => ({
          id: event.id,
          type: event.event_type,
          date: event.event_date ?? event.created_at,
          detail: event.summary,
        })),
      });
    }

    await requirePlan(supabase, body.farmId, "h2a");
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const [workers, housing, daily, documents] = await Promise.all([
      collectPages<any>((from, to) =>
        supabase
          .from("h2a_workers")
          .select("id,employee_number,legal_name,status,work_authorization_end")
          .eq("farm_id", body.farmId)
          .order("id")
          .range(from, to),
      ),
      collectPages<any>((from, to) =>
        supabase
          .from("h2a_housing")
          .select("id,name,certificate_number,certificate_expires_on")
          .eq("farm_id", body.farmId)
          .eq("active", true)
          .order("id")
          .range(from, to),
      ),
      collectPages<any>((from, to) =>
        supabase
          .from("h2a_daily_records")
          .select("id,work_date,approved_at,locked_at")
          .eq("farm_id", body.farmId)
          .order("work_date", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
      collectPages<any>((from, to) =>
        supabase
          .from("h2a_documents")
          .select("id,title,document_type,expires_on")
          .eq("farm_id", body.farmId)
          .order("id")
          .range(from, to),
      ),
    ]);

    const items: Array<{
      id: string;
      type: string;
      date?: string | null;
      detail: string;
    }> = [];
    for (const worker of workers) {
      if (worker.work_authorization_end && worker.work_authorization_end <= soon)
        items.push({
          id: worker.id,
          type: "worker",
          date: worker.work_authorization_end,
          detail: `${worker.employee_number} · work authorization ends within 30 days`,
        });
    }
    for (const house of housing) {
      if (!house.certificate_number)
        items.push({
          id: house.id,
          type: "housing",
          detail: `${house.name} · certificate number missing`,
        });
      if (house.certificate_expires_on && house.certificate_expires_on <= soon)
        items.push({
          id: house.id,
          type: "housing",
          date: house.certificate_expires_on,
          detail: `${house.name} · certificate expires within 30 days`,
        });
    }
    for (const row of daily) {
      if (!row.approved_at)
        items.push({
          id: row.id,
          type: "daily record",
          date: row.work_date,
          detail: row.locked_at
            ? "Locked and waiting for approval"
            : "Draft / not approved",
        });
    }
    for (const doc of documents) {
      if (doc.expires_on && doc.expires_on <= soon)
        items.push({
          id: doc.id,
          type: doc.document_type,
          date: doc.expires_on,
          detail: `${doc.title} · expires within 30 days`,
        });
    }

    return Response.json({
      title: "H-2A records needing attention",
      answer: items.length
        ? `${items.length} H-2A item${items.length === 1 ? "" : "s"} need review as of ${today}.`
        : "No H-2A attention items were found by the current FarmVoice checks.",
      rows: items.slice(0, 150),
      note: "This is a recordkeeping review, not a legal or compliance determination.",
    });
  } catch (error) {
    return apiError(error);
  }
}
