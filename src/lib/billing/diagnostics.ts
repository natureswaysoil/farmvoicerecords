// Deliberately exclude messages, bodies, customer/farm IDs, signatures and keys.
export function logBillingFailure(operation: string, stage: string, error: unknown,
  event?: { id: string; type: string }) {
  const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const safe = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(v) ? v : undefined;
  console.error(JSON.stringify({ category: "billing_failure", operation, stage,
    eventId: event?.id, eventType: event?.type,
    code: safe(e.code), type: safe(e.type), requestId: safe(e.requestId),
    status: typeof e.statusCode === "number" ? e.statusCode : undefined,
  }));
}
