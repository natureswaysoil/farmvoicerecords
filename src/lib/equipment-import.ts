import crypto from "node:crypto";

export type EquipmentImportRow = {
  source?: unknown;
  sourceRecordId?: unknown;
  machine?: unknown;
  operation?: unknown;
  field?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  product?: unknown;
  rate?: unknown;
  rateUnit?: unknown;
  area?: unknown;
  areaUnit?: unknown;
  yieldValue?: unknown;
  yieldUnit?: unknown;
  moisture?: unknown;
};

function textValue(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function nullableText(value: unknown, max = 500) {
  const valueText = textValue(value, max);
  return valueText || null;
}

function nullableNumber(value: unknown, label: string, max?: number) {
  const text = typeof value === "string" ? value.trim().replace(/%$/, "") : value;
  if (text === "" || text === null || text === undefined) return null;
  const number = typeof text === "number" ? text : Number(text);
  if (!Number.isFinite(number) || number < 0 || (max !== undefined && number > max)) {
    throw new Error(`${label} must be a valid non-negative number${max !== undefined ? ` no greater than ${max}` : ""}.`);
  }
  return number;
}

function nullableDate(value: unknown, label: string) {
  const text = textValue(value, 80);
  if (!text) return null;
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${label} must be an ISO 8601 date/time, including a timezone when time is supplied.`);
  }
  return new Date(milliseconds).toISOString();
}

export function normalizeFieldName(value: unknown) {
  return textValue(value, 200).replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function classifyEquipmentOperation(operation: string) {
  if (/harvest|combine/i.test(operation)) return "harvest";
  if (/spray|apply|application|fertiliz/i.test(operation)) return "input";
  if (/plant|seed/i.test(operation)) return "planting";
  return "note";
}

export function normalizeEquipmentImportRow(row: EquipmentImportRow) {
  const source = textValue(row.source, 80) || "CSV import";
  const operation = textValue(row.operation, 120);
  const fieldName = textValue(row.field, 200);
  if (!operation) throw new Error("Operation is required.");
  if (!fieldName) throw new Error("Field is required.");

  const startedAt = nullableDate(row.startedAt, "Start time");
  const endedAt = nullableDate(row.endedAt, "End time");
  if (startedAt && endedAt && endedAt < startedAt) {
    throw new Error("End time cannot be before start time.");
  }

  const normalized = {
    source,
    sourceRecordId: nullableText(row.sourceRecordId, 300),
    machine: nullableText(row.machine, 200),
    operation,
    fieldName,
    fieldKey: normalizeFieldName(fieldName),
    startedAt,
    endedAt,
    product: nullableText(row.product, 300),
    rate: nullableNumber(row.rate, "Rate"),
    rateUnit: nullableText(row.rateUnit, 80),
    area: nullableNumber(row.area, "Area"),
    areaUnit: nullableText(row.areaUnit, 80),
    yieldValue: nullableNumber(row.yieldValue, "Yield"),
    yieldUnit: nullableText(row.yieldUnit, 80),
    moisture: nullableNumber(row.moisture, "Moisture", 100),
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");

  return { ...normalized, fingerprint };
}
