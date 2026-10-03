import { NextResponse } from "next/server";
import { requireFarmOwner } from "@/src/lib/quickbooks-server";
import {
  normalizeEquipmentImportRow,
  normalizeFieldName,
  type EquipmentImportRow,
} from "@/src/lib/equipment-import";

export const runtime = "nodejs";

const MAX_IMPORT_ROWS = 500;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requestedFarmId =
      typeof body.farmId === "string" ? body.farmId : null;
    const inputRows = Array.isArray(body.rows)
      ? (body.rows as EquipmentImportRow[])
      : [];

    if (!inputRows.length) {
      return NextResponse.json(
        { error: "At least one equipment record is required." },
        { status: 400 },
      );
    }
    if (inputRows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `Import at most ${MAX_IMPORT_ROWS} equipment records at a time.` },
        { status: 400 },
      );
    }

    const { supabase, farmId, user } = await requireFarmOwner(requestedFarmId);
    const { data: fields, error: fieldError } = await supabase
      .from("fields")
      .select("id,name")
      .eq("farm_id", farmId)
      .eq("active", true);

    if (fieldError) throw fieldError;

    const fieldsByName = new Map<string, Array<{ id: string; name: string }>>();
    for (const field of fields ?? []) {
      const key = normalizeFieldName(field.name);
      const matches = fieldsByName.get(key) ?? [];
      matches.push({ id: field.id as string, name: field.name as string });
      fieldsByName.set(key, matches);
    }

    const issues: Array<{ row: number; field?: string; error: string }> = [];
    const records: Record<string, unknown>[] = [];

    inputRows.forEach((inputRow, index) => {
      try {
        const row = normalizeEquipmentImportRow(inputRow);
        const matches = fieldsByName.get(row.fieldKey) ?? [];
        if (matches.length === 0) {
          issues.push({
            row: index + 1,
            field: row.fieldName,
            error: "No active FarmVoice field matches this name.",
          });
          return;
        }
        if (matches.length > 1) {
          issues.push({
            row: index + 1,
            field: row.fieldName,
            error: "More than one FarmVoice field has this name. Rename the fields so the match is unique.",
          });
          return;
        }

        records.push({
          farm_id: farmId,
          field_id: matches[0].id,
          created_by: user.id,
          source: row.source,
          source_record_id: row.sourceRecordId,
          import_fingerprint: row.fingerprint,
          machine: row.machine,
          operation: row.operation,
          started_at: row.startedAt,
          ended_at: row.endedAt,
          product: row.product,
          rate: row.rate,
          rate_unit: row.rateUnit,
          area: row.area,
          area_unit: row.areaUnit,
          yield_value: row.yieldValue,
          yield_unit: row.yieldUnit,
          moisture: row.moisture,
          raw_payload: inputRow,
        });
      } catch (error) {
        issues.push({
          row: index + 1,
          error: error instanceof Error ? error.message : "Invalid equipment record.",
        });
      }
    });

    if (issues.length) {
      return NextResponse.json(
        {
          error: "Fix the equipment records that could not be matched or validated.",
          issues,
        },
        { status: 400 },
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("equipment_records")
      .upsert(records, {
        onConflict: "farm_id,import_fingerprint",
        ignoreDuplicates: true,
      })
      .select("id,field_id,operation,source");

    if (insertError) throw insertError;

    const imported = inserted?.length ?? 0;
    return NextResponse.json({
      imported,
      skippedDuplicates: records.length - imported,
      requested: records.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Equipment import failed.";
    const status =
      message === "Sign in is required."
        ? 401
        : /owner|farm access|select a farm/i.test(message)
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
