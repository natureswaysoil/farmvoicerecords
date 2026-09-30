import { z } from "zod";

export const pesticideKeys = [
  "applicatorName",
  "certificationNumber",
  "productName",
  "epaRegNumber",
  "amountApplied",
  "amountUnit",
  "cropOrSite",
  "fieldLocation",
  "areaTreated",
  "areaUnit",
  "applicationDate",
] as const;
export const purchaseKeys = [
  "vendor",
  "item",
  "quantity",
  "unit",
  "totalCost",
  "purchaseDate",
  "fieldLocation",
] as const;
export type SuggestedField = { value: string | null; evidence: string | null };
const suggestion = z.object({
  value: z.string().max(200).nullable(),
  evidence: z.string().max(1000).nullable(),
});
export const extractionSchema = z.object({
  applicatorName: suggestion,
  certificationNumber: suggestion,
  productName: suggestion,
  epaRegNumber: suggestion,
  amountApplied: suggestion,
  amountUnit: suggestion,
  cropOrSite: suggestion,
  fieldLocation: suggestion,
  areaTreated: suggestion,
  areaUnit: suggestion,
  applicationDate: suggestion,
  vendor: suggestion,
  item: suggestion,
  quantity: suggestion,
  unit: suggestion,
  totalCost: suggestion,
  purchaseDate: suggestion,
});
export function supportedSuggestions(
  note: string,
  output: z.infer<typeof extractionSchema>,
  type: "pesticide" | "purchase",
) {
  const normalized = note.toLocaleLowerCase().replace(/\s+/g, " ");
  return Object.fromEntries(
    (type === "pesticide" ? pesticideKeys : purchaseKeys).flatMap((key) => {
      const field = output[key];
      if (!field.value?.trim() || !field.evidence?.trim()) return [];
      if (
        !normalized.includes(
          field.evidence.toLocaleLowerCase().replace(/\s+/g, " ").trim(),
        )
      )
        return [];
      return [
        [key, { value: field.value.trim(), evidence: field.evidence.trim() }],
      ];
    }),
  );
}
export function fillEmptyFields(
  current: Record<string, unknown>,
  suggestions: Record<string, SuggestedField>,
) {
  const result = { ...current };
  for (const [key, field] of Object.entries(suggestions)) {
    if (
      [...pesticideKeys, ...purchaseKeys].includes(
        key as (typeof pesticideKeys)[number],
      ) &&
      field.value &&
      (result[key] == null || result[key] === "")
    )
      result[key] = field.value;
  }
  return result;
}
export const gpsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  capturedAt: z.iso.datetime(),
});
export const recordRequestSchema = z.object({
  id: z.uuid(),
  expectedRevision: z.number().int().positive().optional(),
  changeReason: z.string().trim().max(1000).optional(),
  farmId: z.uuid(),
  userId: z.uuid(),
  type: z.enum(["pesticide", "purchase"]),
  status: z.enum(["draft", "confirmed"]),
  createdAt: z.iso.datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown()).superRefine((payload, ctx) => {
    if (JSON.stringify(payload).length > 25000)
      ctx.addIssue({ code: "custom", message: "Payload too large" });
    for (const key of new Set([...pesticideKeys, ...purchaseKeys])) {
      const value = payload[key];
      if (value == null) continue;
      const numeric = [
        "amountApplied",
        "areaTreated",
        "quantity",
        "totalCost",
      ].includes(key);
      if (
        !(typeof value === "string" && value.length <= 200) &&
        !(numeric && typeof value === "number" && Number.isFinite(value))
      )
        ctx.addIssue({ code: "custom", message: `Invalid ${key}` });
    }
    for (const key of [
      "isRestrictedUse",
      "isSpotTreatment",
      "isGreenhouseOrNursery",
    ])
      if (payload[key] != null && typeof payload[key] !== "boolean")
        ctx.addIssue({ code: "custom", message: `Invalid ${key}` });
    if (payload.gps != null && !gpsSchema.safeParse(payload.gps).success)
      ctx.addIssue({ code: "custom", message: "Invalid GPS" });
  }),
  fieldId: z.uuid().nullable(),
});
export type QueuedRecord = z.infer<typeof recordRequestSchema>;
export function purchaseProblems(payload: Record<string, unknown>): string[] {
  const missing = [
    "vendor",
    "item",
    "purchaseDate",
    "quantity",
    "unit",
    "totalCost",
  ].filter((k) => !String(payload[k] ?? "").trim());
  if (
    !Number.isFinite(Number(payload.quantity)) ||
    !(Number(payload.quantity) > 0)
  )
    missing.push("positive quantity");
  if (
    !Number.isFinite(Number(payload.totalCost)) ||
    Number(payload.totalCost) < 0
  )
    missing.push("valid total cost");
  const date = String(payload.purchaseDate ?? "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    missing.push("valid purchase date");
  return [...new Set(missing)];
}
