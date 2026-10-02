import {
  validatePesticideRecord,
  type PesticideRecord,
} from "@/src/compliance/pesticide-record-validation";
import { purchaseProblems } from "@/src/lib/records/schema";

export const ASK_FARMVOICE_PROMPTS = [
  "What farm records are incomplete?",
  "Show pesticide applications for Field X.",
  "How many hours did my crew work?",
  "Show scheduled versus actual hours.",
  "What H-2A records need attention?",
  "Summarize activity on Field X.",
] as const;

export type AskFarmVoiceIntent =
  | "incomplete_records"
  | "pesticide_field"
  | "crew_hours"
  | "scheduled_vs_actual"
  | "h2a_attention"
  | "field_activity"
  | "unsupported";

type FarmRecord = {
  record_type: "pesticide" | "purchase";
  status: string;
  payload: Record<string, unknown> | null;
  created_at?: string | null;
};

function missing(payload: Record<string, unknown>, key: string) {
  return !String(payload[key] ?? "").trim();
}

export function recordReviewProblems(record: FarmRecord): string[] {
  const payload = record.payload ?? {};
  const problems: string[] = [];

  if (record.status !== "confirmed") problems.push("draft not confirmed");

  if (record.record_type === "purchase") {
    problems.push(...purchaseProblems(payload));
    return [...new Set(problems)];
  }

  for (const [key, label] of [
    ["productName", "product name"],
    ["applicationDate", "application date"],
    ["fieldLocation", "field/location"],
    ["amountApplied", "amount applied"],
  ] as const) {
    if (missing(payload, key)) problems.push(label);
  }

  if (payload.isRestrictedUse === true) {
    const result = validatePesticideRecord({
      ...(payload as unknown as PesticideRecord),
      isRestrictedUse: true,
      recordCreatedAt: record.created_at ?? undefined,
    });
    problems.push(
      ...result.issues
        .filter((issue) => issue.kind !== "timing")
        .map((issue) => issue.label),
    );
  }

  return [...new Set(problems)];
}

export function completedHours(
  rows: Array<{ clock_in: string; clock_out: string | null }>,
): number {
  return rows.reduce((total, row) => {
    if (!row.clock_out) return total;
    const start = Date.parse(row.clock_in);
    const end = Date.parse(row.clock_out);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return total;
    return total + (end - start) / 3_600_000;
  }, 0);
}

export function scheduledHours(
  rows: Array<{ starts_at: string; ends_at: string }>,
): number {
  return rows.reduce((total, row) => {
    const start = Date.parse(row.starts_at);
    const end = Date.parse(row.ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return total;
    return total + (end - start) / 3_600_000;
  }, 0);
}

export function normalizedField(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}
