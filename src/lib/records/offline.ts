import { recordRequestSchema, type QueuedRecord } from "./schema.ts";
const prefix = (userId: string) => `farmvoice-queue-v1:${userId}:`;
const errorKey = (userId: string, id: string) =>
  `farmvoice-delivery-error:${userId}:${id}`;
export function queuedRecords(userId: string): QueuedRecord[] {
  const rows: QueuedRecord[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix(userId))) continue;
    try {
      const parsed = recordRequestSchema.safeParse(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
      if (parsed.success && parsed.data.userId === userId)
        rows.push(parsed.data);
    } catch {
      /* Preserve damaged entries for raw export; do not block intact drafts. */
    }
  }
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function rawQueuedRecords(userId: string) {
  const entries: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix(userId)))
      entries[key] = localStorage.getItem(key);
  }
  return entries;
}
export function queueRecord(record: QueuedRecord) {
  localStorage.setItem(
    prefix(record.userId) + record.id,
    JSON.stringify(record),
  );
  localStorage.removeItem(errorKey(record.userId, record.id));
}
export function discardQueuedRecord(userId: string, id: string) {
  localStorage.removeItem(prefix(userId) + id);
  localStorage.removeItem(errorKey(userId, id));
}
export function deliveryError(userId: string, id: string) {
  return localStorage.getItem(errorKey(userId, id));
}
const flights = new Map<string, Promise<number>>();
export function syncRecords(userId: string, farmId: string): Promise<number> {
  const key = `${userId}:${farmId}`;
  if (flights.has(key)) return flights.get(key)!;
  const task = deliver(userId, farmId).finally(() => flights.delete(key));
  flights.set(key, task);
  return task;
}
async function deliver(userId: string, farmId: string) {
  let count = 0;
  const errors: string[] = [];
  for (const row of queuedRecords(userId).filter((r) => r.farmId === farmId)) {
    const snapshot = localStorage.getItem(prefix(userId) + row.id);
    try {
      const response = await fetch("/api/records", {
        method: row.expectedRevision == null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Record delivery failed.");
      // Another tab may have repaired the draft while this request was in flight.
      if (localStorage.getItem(prefix(userId) + row.id) === snapshot)
        discardQueuedRecord(userId, row.id);
      count++;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Delivery failed. Reconnect and retry.";
      localStorage.setItem(errorKey(userId, row.id), message);
      errors.push(message);
    }
  }
  if (errors.length)
    throw new Error(`${errors.length} record(s) still pending: ${errors[0]}`);
  return count;
}
