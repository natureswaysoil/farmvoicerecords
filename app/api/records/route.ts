import { validCaptureTime } from "@/src/lib/records/receipt";
import {
  authorizeFarm,
  requirePlan,
  AccessError,
  apiError,
} from "@/src/lib/access-server";
import {
  recordRequestSchema,
  purchaseProblems,
  gpsSchema,
} from "@/src/lib/records/schema";
import {
  validatePesticideRecord,
  type PesticideRecord,
} from "@/src/compliance/pesticide-record-validation";
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  return (
    Object.keys(x).length === Object.keys(y).length &&
    Object.keys(x).every((k) => equal(x[k], y[k]))
  );
};
function sameDelivery(
  existing: Record<string, any>,
  record: ReturnType<typeof recordRequestSchema.parse>,
) {
  const { recordCreatedAt: _savedTime, ...savedPayload } =
    existing.payload ?? {};
  const { recordCreatedAt: _requestedTime, ...requestedPayload } =
    record.payload;
  return (
    existing.record_type === record.type &&
    existing.status === record.status &&
    (existing.field_id ?? null) === (record.fieldId ?? null) &&
    equal(savedPayload, requestedPayload)
  );
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 30000)
      throw new AccessError("Record is too large.", 413);
    const parsed = recordRequestSchema.safeParse(await request.json());
    if (!parsed.success) throw new AccessError("Invalid record.", 400);
    const record = parsed.data;
    const { supabase, user } = await authorizeFarm(record.farmId);
    if (record.userId !== user.id)
      throw new AccessError("This draft belongs to a different account.", 403);
    // A retry after a successful insert must succeed even if the trial has since expired.
    const existing = await supabase
      .from("farm_records")
      .select(
        "id,created_by,farm_id,record_type,status,field_id,payload,revision",
      )
      .eq("id", record.id)
      .maybeSingle();
    if (existing.error)
      throw new AccessError(
        "Unable to check record delivery. Retry shortly.",
        503,
      );
    if (existing.data) {
      if (
        existing.data.created_by !== user.id ||
        existing.data.farm_id !== record.farmId
      )
        throw new AccessError("Record ID is already in use.", 409);
      if (!sameDelivery(existing.data, record))
        throw new AccessError(
          "This ID already has a saved record. Reopen the current version to apply your changes.",
          409,
        );
      return Response.json({ id: record.id, revision: existing.data.revision });
    }
    if (!validCaptureTime(record.createdAt))
      throw new AccessError("Capture time must be within the last 30 days and no more than 5 minutes ahead. Keep your offline copy and contact support for older records.", 400);
    await requirePlan(supabase, record.farmId);
    if (record.fieldId) {
      const field = await supabase
        .from("fields")
        .select("id")
        .eq("id", record.fieldId)
        .eq("farm_id", record.farmId)
        .maybeSingle();
      if (!field.data)
        throw new AccessError("Choose a field in this farm.", 400);
    }
    const payload = { ...record.payload, recordCreatedAt: record.createdAt };
    if (record.status === "confirmed") {
      if (record.type === "pesticide") {
        if (typeof record.payload.isRestrictedUse !== "boolean")
          throw new AccessError("Choose the pesticide record type.", 400);
        if (
          !validatePesticideRecord(payload as unknown as PesticideRecord)
            .complete
        )
          throw new AccessError(
            "Complete the pesticide fields before confirming.",
            400,
          );
      } else if (purchaseProblems(payload).length)
        throw new AccessError(
          "Complete the purchase fields before confirming.",
          400,
        );
    }
    const gps = record.payload.gps ? gpsSchema.parse(record.payload.gps) : null;
    const { error } = await supabase.from("farm_records").insert({
      id: record.id,
      farm_id: record.farmId,
      created_by: user.id,
      field_id: record.fieldId,
      record_type: record.type,
      status: record.status,
      payload,
      recording_lat: gps?.lat ?? null,
      recording_lng: gps?.lng ?? null,
      recording_accuracy_m: gps?.accuracy ?? null,
      recording_captured_at: gps?.capturedAt ?? null,
      created_at: record.createdAt,
    });
    if (error && error.code !== "23505")
      throw new AccessError(
        "Record could not be saved. Check your plan and retry.",
        400,
      );
    if (error) {
      const delivered = await supabase
        .from("farm_records")
        .select(
          "id,created_by,farm_id,record_type,status,field_id,payload,revision",
        )
        .eq("id", record.id)
        .maybeSingle();
      if (delivered.error)
        throw new AccessError(
          "Unable to confirm delivery. Retry shortly.",
          503,
        );
      if (
        !delivered.data ||
        delivered.data.created_by !== user.id ||
        delivered.data.farm_id !== record.farmId
      )
        throw new AccessError("Record ID is already in use.", 409);
      if (!sameDelivery(delivered.data, record))
        throw new AccessError(
          "This ID already has a saved record. Reopen it to apply your changes.",
          409,
        );
    }
    return Response.json({ id: record.id });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = recordRequestSchema.safeParse(await request.json());
    if (!parsed.success || parsed.data.expectedRevision == null)
      throw new AccessError("Invalid record revision.", 400);
    const record = parsed.data;
    const { supabase, user, farm } = await authorizeFarm(record.farmId);
    if (record.userId !== user.id)
      throw new AccessError("This draft belongs to another account.", 403);
    const { data: old, error } = await supabase
      .from("farm_records")
      .select("*")
      .eq("id", record.id)
      .eq("farm_id", record.farmId)
      .maybeSingle();
    if (error) throw new AccessError("Could not load the saved record.", 503);
    if (!old || (old.created_by !== user.id && farm.role !== "owner"))
      throw new AccessError("Record editing access is required.", 403);
    const payload = { ...record.payload, recordCreatedAt: old.created_at };
    // A lost response can be retried after delivery or subscription expiry.
    if (
      old.revision === record.expectedRevision! + 1 &&
      old.updated_by === user.id &&
      old.status === record.status &&
      old.record_type === record.type &&
      old.field_id === record.fieldId &&
      equal(old.payload, payload)
    )
      return Response.json({ id: old.id, revision: old.revision });
    if (old.revision !== record.expectedRevision)
      throw new AccessError(
        "This record changed elsewhere. Reopen the current version before saving your correction.",
        409,
      );
    await requirePlan(supabase, record.farmId);
    if (
      old.status === "confirmed" &&
      (record.status !== "confirmed" ||
        (record.changeReason?.trim().length ?? 0) < 5)
    )
      throw new AccessError(
        "Keep confirmed status and enter a correction reason.",
        400,
      );
    if (record.fieldId) {
      const field = await supabase
        .from("fields")
        .select("id")
        .eq("id", record.fieldId)
        .eq("farm_id", record.farmId)
        .maybeSingle();
      if (field.error || !field.data)
        throw new AccessError("Choose a field in this farm.", 400);
    }
    if (record.status === "confirmed") {
      const complete =
        record.type === "pesticide"
          ? typeof record.payload.isRestrictedUse === "boolean" &&
            validatePesticideRecord(payload as unknown as PesticideRecord)
              .complete
          : purchaseProblems(payload).length === 0;
      if (!complete)
        throw new AccessError(
          "Complete the required fields before confirming.",
          400,
        );
    }
    const gps = record.payload.gps ? gpsSchema.parse(record.payload.gps) : null;
    const result = await supabase
      .from("farm_records")
      .update({
        payload,
        status: record.status,
        record_type: record.type,
        field_id: record.fieldId,
        change_reason: record.changeReason || null,
        recording_lat: gps?.lat ?? null,
        recording_lng: gps?.lng ?? null,
        recording_accuracy_m: gps?.accuracy ?? null,
        recording_captured_at: gps?.capturedAt ?? null,
      })
      .eq("id", record.id)
      .eq("farm_id", record.farmId)
      .eq("revision", record.expectedRevision)
      .select("id,revision")
      .maybeSingle();
    if (result.error)
      throw new AccessError(
        "Could not update this record. Check your access and retry.",
        400,
      );
    if (!result.data)
      throw new AccessError(
        "This record changed elsewhere. Reopen it before saving.",
        409,
      );
    return Response.json(result.data);
  } catch (error) {
    return apiError(error);
  }
}
