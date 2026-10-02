export type OfflineH2aDailyBatch = {
  id: string;
  farmId: string;
  userId: string;
  queuedAt: string;
  rows: Array<Record<string, unknown>>;
};

const prefix = (userId:string,farmId:string) =>
  `farmvoice-h2a-daily-v1:${userId}:${farmId}:`;

export function h2aDailyBatches(userId:string,farmId:string) {
  const rows: OfflineH2aDailyBatch[] = [];
  if (typeof localStorage === "undefined") return rows;
  for (let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);
    if (!key?.startsWith(prefix(userId,farmId))) continue;
    try {
      const value=JSON.parse(localStorage.getItem(key) ?? "null") as OfflineH2aDailyBatch;
      if (value?.id && value.userId===userId && value.farmId===farmId && Array.isArray(value.rows))
        rows.push(value);
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

export async function syncH2aDailyBatches(supabase:any,userId:string,farmId:string) {
  for (const batch of h2aDailyBatches(userId,farmId)) {
    const { error } = await supabase.from("h2a_daily_records")
      .upsert(batch.rows,{onConflict:"farm_id,worker_id,work_date"});
    if (error) throw error;
    removeH2aDailyBatch(batch);
  }
}
