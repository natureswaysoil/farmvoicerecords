import { remapQueuedEvidenceRecordId } from "./evidence-offline";

export type H2aDailyRow = Record<string, unknown> & {
  id: string;
  farm_id: string;
  worker_id: string;
  work_date: string;
};

export type OfflineH2aDailyBatch = {
  id: string;
  farmId: string;
  userId: string;
  queuedAt: string;
  rows: H2aDailyRow[];
};

const prefix = (userId:string,farmId:string) =>
  `farmvoice-h2a-daily-v2:${userId}:${farmId}:`;

export function h2aDailyBatches(userId:string,farmId:string) {
  const rows: OfflineH2aDailyBatch[] = [];
  if (typeof localStorage === "undefined") return rows;
  for (let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);
    if (!key?.startsWith(prefix(userId,farmId))) continue;
    try {
      const value=JSON.parse(localStorage.getItem(key) ?? "null") as OfflineH2aDailyBatch;
      if (
        value?.id &&
        value.userId===userId &&
        value.farmId===farmId &&
        Array.isArray(value.rows)
      ) rows.push(value);
    } catch {}
  }
  return rows.sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt));
}

export function storeH2aDailyBatch(batch:OfflineH2aDailyBatch) {
  localStorage.setItem(prefix(batch.userId,batch.farmId)+batch.id,JSON.stringify(batch));
}

export function removeH2aDailyBatch(batch:OfflineH2aDailyBatch) {
  localStorage.removeItem(prefix(batch.userId,batch.farmId)+batch.id);
}

export function isRetryableH2aSyncError(error: unknown) {
  const e=error as {message?:string;status?:number;code?:string}|null;
  const message=String(e?.message ?? "").toLowerCase();
  const status=Number(e?.status ?? 0);
  return (
    status>=500 ||
    /fetch|network|timeout|timed out|connection|offline|load failed|failed to fetch/.test(message)
  );
}

export async function saveH2aDailyRows(
  supabase:any,
  userId:string,
  farmId:string,
  rows:H2aDailyRow[],
) {
  for (const row of rows) {
    const lookup=await supabase
      .from("h2a_daily_records")
      .select("id")
      .eq("farm_id",farmId)
      .eq("worker_id",row.worker_id)
      .eq("work_date",row.work_date)
      .maybeSingle();
    if (lookup.error) throw lookup.error;

    const { id: localId, ...payload } = row;
    if (lookup.data?.id) {
      const serverId=String(lookup.data.id);
      const update=await supabase
        .from("h2a_daily_records")
        .update(payload)
        .eq("id",serverId)
        .eq("farm_id",farmId)
        .select("id");
      if (update.error) throw update.error;
      if (!update.data?.length) throw new Error("H-2A daily record update could not be reconciled.");
      if (serverId!==localId)
        await remapQueuedEvidenceRecordId(farmId,userId,localId,serverId);
    } else {
      const insert=await supabase
        .from("h2a_daily_records")
        .insert(row)
        .select("id");
      if (insert.error) throw insert.error;
      if (!insert.data?.length) throw new Error("H-2A daily record insert did not return an id.");
    }
  }
}

export async function syncH2aDailyBatches(supabase:any,userId:string,farmId:string) {
  for (const batch of h2aDailyBatches(userId,farmId)) {
    await saveH2aDailyRows(supabase,userId,farmId,batch.rows);
    removeH2aDailyBatch(batch);
  }
}
