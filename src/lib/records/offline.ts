import { recordRequestSchema, type QueuedRecord } from "./schema.ts";
const prefix = (userId: string) => `farmvoice-queue-v1:${userId}:`;
export function queuedRecords(userId: string): QueuedRecord[] {
  const rows: QueuedRecord[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix(userId))) continue;
    const parsed = recordRequestSchema.safeParse(
      JSON.parse(localStorage.getItem(key) ?? "null"),
    );
    if (parsed.success && parsed.data.userId === userId) rows.push(parsed.data);
  }
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function queueRecord(record: QueuedRecord) {
  localStorage.setItem(
    prefix(record.userId) + record.id,
    JSON.stringify(record),
  );
}
export async function syncRecords(userId: string, farmId: string) {
  let count = 0;
  for (const row of queuedRecords(userId).filter((r) => r.farmId === farmId)) {
    const response = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Record delivery failed.");
    localStorage.removeItem(prefix(userId) + row.id);
    count++;
  }
  return count;
}
