import { z } from "zod";
export const crewBatchSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  farmId: z.uuid(),
  createdAt: z.iso.datetime(),
  entries: z
    .array(
      z.object({
        id: z.uuid(),
        worker_id: z.uuid(),
        clock_in: z.iso.datetime(),
        clock_out: z.iso.datetime(),
        break_minutes: z.number().int().nonnegative(),
        job: z.string().trim().min(1).max(200),
        field_name: z.string().max(200),
        supervisor_lat: z.number().min(-90).max(90).nullable(),
        supervisor_lng: z.number().min(-180).max(180).nullable(),
      }),
    )
    .min(1)
    .max(200),
});
export type CrewBatch = z.infer<typeof crewBatchSchema>;
const prefix = (user: string, farm: string) =>
  `farmvoice-crew-v1:${user}:${farm}:`;
export function crewBatches(user: string, farm: string) {
  const batches: CrewBatch[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix(user, farm))) continue;
    try {
      const result = crewBatchSchema.safeParse(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
      if (
        result.success &&
        result.data.userId === user &&
        result.data.farmId === farm
      )
        batches.push(result.data);
    } catch {}
  }
  return batches.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function storeCrewBatch(batch: CrewBatch) {
  crewBatchSchema.parse(batch);
  localStorage.setItem(
    prefix(batch.userId, batch.farmId) + batch.id,
    JSON.stringify(batch),
  );
}
export function removeCrewBatch(batch: CrewBatch) {
  localStorage.removeItem(prefix(batch.userId, batch.farmId) + batch.id);
}
export function crewBackup(user: string, farm: string) {
  const rows: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix(user, farm)))
      rows[key] = localStorage.getItem(key);
  }
  return rows;
}
