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

export {
  completedHours,
  crewEntryHours,
  scheduledHours,
  normalizedField,
} from "@/src/lib/ask-farmvoice-math";
