import { NextResponse } from "next/server";
import { collectDeerePages, johnDeereRequest } from "@/src/lib/john-deere";
import { getValidJohnDeereAccessToken } from "@/src/lib/john-deere-server";
import {
  normalizeEquipmentImportRow,
  normalizeFieldName,
  type EquipmentImportRow,
} from "@/src/lib/equipment-import";
import {
  deereApplicationRateResultToEquipmentRows,
  type DeereFieldOperation,
} from "@/src/lib/john-deere-application-rate";
import {
  deereHarvestYieldResultToEquipmentRow,
  type DeereHarvestFieldOperation,
} from "@/src/lib/john-deere-harvest-yield";

export const runtime = "nodejs";

type DeereField = {
  id?: string;
  name?: string;
};

type DeereOperation = DeereFieldOperation &
  DeereHarvestFieldOperation & {
    id?: string;
    fieldOperationType?: string;
  };

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseWindow(body: Record<string, unknown>) {
  const end = typeof body.endDate === "string" ? new Date(body.endDate) : new Date();
  const start =
    typeof body.startDate === "string"
      ? new Date(body.startDate)
      : new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error("Invalid sync date.");
  }
  if (start > end) throw new Error("Sync start date cannot be after end date.");
  if (end.getTime() - start.getTime() > 6 * 24 * 60 * 60 * 1000 + 86_399_999) {
    throw new Error("John Deere field-operation sync is limited to a 7-day window.");
  }

  return { startDate: isoDay(start), endDate: isoDay(end) };
}

async function loadMeasurement(
  accessToken: string,
  operation: DeereOperation,
  measurementName: "ApplicationRateResult" | "HarvestYieldResult",
) {
  const existing = operation.measurementTypes?.find(
    (measurement) =>
      String(measurement.measurementName ?? "").toLowerCase() ===
      measurementName.toLowerCase(),
  );
  const hasValues =
    measurementName === "ApplicationRateResult"
      ? Boolean(
          existing &&
            "applicationProductTotals" in existing &&
            Array.isArray(
              (existing as { applicationProductTotals?: unknown[] })
                .applicationProductTotals,
            ),
        )
      : Boolean(
          existing &&
            ("averageYield" in existing ||
              "averageWetMass" in existing ||
              "averageMoisture" in existing),
        );

  if (hasValues) return operation;

  const id = String(operation.id ?? "").trim();
  if (!id) return operation;

  try {
    const response = await johnDeereRequest<Record<string, unknown>>(
      accessToken,
      `/fieldOperations/${encodeURIComponent(id)}/measurementTypes/${measurementName}`,
      { unitSystem: "ENGLISH" },
    );
    return {
      ...operation,
      measurementTypes: [
        ...(operation.measurementTypes ?? []).filter(
          (measurement) =>
            String(measurement.measurementName ?? "").toLowerCase() !==
            measurementName.toLowerCase(),
        ),
        response.data,
      ],
    } as DeereOperation;
  } catch {
    return operation;
  }
}

export async function POST(request: Request) {
  let farmIdForError: string | null = null;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const farmId = typeof body.farmId === "string" ? body.farmId : null;
    farmIdForError = farmId;
    const window = parseWindow(body);

    const ctx = await getValidJohnDeereAccessToken(farmId);
    const orgId = String(ctx.connection.selected_org_id ?? "").trim();
    if (!orgId) {
      return NextResponse.json(
        { error: "Select a John Deere organization before syncing." },
        { status: 400 },
      );
    }

    const [deereFields, farmVoiceFieldResult, mappingResult] = await Promise.all([
      collectDeerePages<DeereField>(
        ctx.accessToken,
        `/organizations/${encodeURIComponent(orgId)}/fields`,
        { unitSystem: "ENGLISH" },
      ),
      ctx.supabase
        .from("fields")
        .select("id,name")
        .eq("farm_id", ctx.farmId)
        .eq("active", true),
      ctx.supabase
        .from("john_deere_field_mappings")
        .select("deere_field_id,field_id,deere_field_name")
        .eq("farm_id", ctx.farmId)
        .eq("org_id", orgId),
    ]);

    if (farmVoiceFieldResult.error) throw farmVoiceFieldResult.error;
    if (mappingResult.error) throw mappingResult.error;

    const farmVoiceFields = (farmVoiceFieldResult.data ?? []) as Array<{
      id: string;
      name: string;
    }>;
    const byName = new Map<string, Array<{ id: string; name: string }>>();
    for (const field of farmVoiceFields) {
      const key = normalizeFieldName(field.name);
      const values = byName.get(key) ?? [];
      values.push(field);
      byName.set(key, values);
    }

    const mappingByDeereId = new Map<string, string>(
      (mappingResult.data ?? []).map((mapping) => [
        String(mapping.deere_field_id),
        String(mapping.field_id),
      ]),
    );
    const fieldById = new Map(farmVoiceFields.map((field) => [field.id, field]));

    const unmatchedFields: Array<{ id: string; name: string }> = [];
    let mappingsCreated = 0;
    let operationsRead = 0;
    const rowsToInsert: Array<{
      fieldId: string;
      row: EquipmentImportRow;
      normalized: ReturnType<typeof normalizeEquipmentImportRow>;
    }> = [];

    for (const deereField of deereFields) {
      const deereFieldId = String(deereField.id ?? "").trim();
      const deereFieldName = String(deereField.name ?? "").trim();
      if (!deereFieldId || !deereFieldName) continue;

      let fieldId = mappingByDeereId.get(deereFieldId) ?? null;
      if (!fieldId) {
        const candidates = byName.get(normalizeFieldName(deereFieldName)) ?? [];
        if (candidates.length === 1) {
          fieldId = candidates[0].id;
          const { error } = await ctx.supabase
            .from("john_deere_field_mappings")
            .upsert(
              {
                farm_id: ctx.farmId,
                org_id: orgId,
                deere_field_id: deereFieldId,
                deere_field_name: deereFieldName,
                field_id: fieldId,
                created_by: ctx.user.id,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "farm_id,org_id,deere_field_id" },
            );
          if (error) throw error;
          mappingByDeereId.set(deereFieldId, fieldId);
          mappingsCreated += 1;
        }
      }

      if (!fieldId || !fieldById.has(fieldId)) {
        unmatchedFields.push({ id: deereFieldId, name: deereFieldName });
        continue;
      }

      const params = new URLSearchParams({
        startDate: window.startDate,
        endDate: window.endDate,
      });
      const operations = await collectDeerePages<DeereOperation>(
        ctx.accessToken,
        `/organizations/${encodeURIComponent(orgId)}/fields/${encodeURIComponent(
          deereFieldId,
        )}/fieldOperations?${params.toString()}`,
        { unitSystem: "ENGLISH" },
      );

      operationsRead += operations.length;

      for (const operation of operations) {
        const type = String(operation.fieldOperationType ?? "").toUpperCase();
        let equipmentRows: EquipmentImportRow[] = [];

        if (type === "APPLICATION") {
          const hydrated = await loadMeasurement(
            ctx.accessToken,
            operation,
            "ApplicationRateResult",
          );
          equipmentRows = deereApplicationRateResultToEquipmentRows({
            fieldName: deereFieldName,
            operation: hydrated,
          });
        } else if (type === "HARVEST") {
          const hydrated = await loadMeasurement(
            ctx.accessToken,
            operation,
            "HarvestYieldResult",
          );
          const row = deereHarvestYieldResultToEquipmentRow({
            fieldName: deereFieldName,
            operation: hydrated,
          });
          if (row) equipmentRows = [row];
        }

        for (const row of equipmentRows) {
          const normalized = normalizeEquipmentImportRow(row);
          rowsToInsert.push({ fieldId, row, normalized });
        }
      }
    }

    const sourceIds = rowsToInsert
      .map(({ normalized }) => normalized.sourceRecordId)
      .filter((value): value is string => Boolean(value));
    const existingSourceIds = new Set<string>();

    for (let i = 0; i < sourceIds.length; i += 100) {
      const batch = sourceIds.slice(i, i + 100);
      if (!batch.length) continue;
      const { data, error } = await ctx.supabase
        .from("equipment_records")
        .select("source_record_id")
        .eq("farm_id", ctx.farmId)
        .eq("source", "John Deere")
        .in("source_record_id", batch);
      if (error) throw error;
      for (const existing of data ?? []) {
        if (existing.source_record_id) {
          existingSourceIds.add(String(existing.source_record_id));
        }
      }
    }

    const records = rowsToInsert
      .filter(
        ({ normalized }) =>
          !normalized.sourceRecordId ||
          !existingSourceIds.has(normalized.sourceRecordId),
      )
      .map(({ fieldId, row, normalized }) => ({
        farm_id: ctx.farmId,
        field_id: fieldId,
        created_by: ctx.user.id,
        source: normalized.source,
        source_record_id: normalized.sourceRecordId,
        import_fingerprint: normalized.fingerprint,
        machine: normalized.machine,
        operation: normalized.operation,
        started_at: normalized.startedAt,
        ended_at: normalized.endedAt,
        product: normalized.product,
        rate: normalized.rate,
        rate_unit: normalized.rateUnit,
        area: normalized.area,
        area_unit: normalized.areaUnit,
        yield_value: normalized.yieldValue,
        yield_unit: normalized.yieldUnit,
        moisture: normalized.moisture,
        raw_payload: row,
      }));

    let imported = 0;
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      if (!batch.length) continue;
      const { data, error } = await ctx.supabase
        .from("equipment_records")
        .upsert(batch, {
          onConflict: "farm_id,import_fingerprint",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw error;
      imported += data?.length ?? 0;
    }

    const now = new Date().toISOString();
    const { error: statusError } = await ctx.supabase
      .from("john_deere_connections")
      .update({
        last_sync_at: now,
        last_error: null,
        status: "connected",
        updated_at: now,
      })
      .eq("farm_id", ctx.farmId);
    if (statusError) throw statusError;

    return NextResponse.json({
      ok: true,
      startDate: window.startDate,
      endDate: window.endDate,
      deereFields: deereFields.length,
      mappingsCreated,
      unmatchedFields,
      operationsRead,
      normalizedRecords: rowsToInsert.length,
      imported,
      skippedDuplicates: rowsToInsert.length - imported,
    });
  } catch (error) {
    try {
      if (farmIdForError) {
        const ctx = await getValidJohnDeereAccessToken(farmIdForError);
        await ctx.supabase
          .from("john_deere_connections")
          .update({
            status: "error",
            last_error:
              error instanceof Error ? error.message.slice(0, 2000) : "Sync failed.",
            updated_at: new Date().toISOString(),
          })
          .eq("farm_id", ctx.farmId);
      }
    } catch {
      // Preserve the original sync error.
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "John Deere sync failed." },
      { status: 400 },
    );
  }
}
