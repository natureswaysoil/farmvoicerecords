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
      .select("id,created_by,farm_id")
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
      return Response.json({ id: record.id });
    }
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
    const { error } = await supabase
      .from("farm_records")
      .insert({
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
    if (error)
      throw new AccessError(
        "Record ID conflict. Retry to confirm delivery.",
        409,
      );
    return Response.json({ id: record.id });
  } catch (error) {
    return apiError(error);
  }
}
