export type OfflineWorkerTime = {
  id: string;
  farmId: string;
  userId: string;
  job: string;
  fieldName: string | null;
  clockIn: string;
  clockOut: string | null;
  clockInLat: number | null;
  clockInLng: number | null;
  clockInAccuracyM: number | null;
  clockOutLat: number | null;
  clockOutLng: number | null;
  clockOutAccuracyM: number | null;
  mode: "insert" | "update";
  queuedAt: string;
};

const prefix = (userId: string, farmId: string) =>
  `farmvoice-worker-time-v1:${userId}:${farmId}:`;

export function queuedWorkerTimes(userId: string, farmId: string) {
  const rows: OfflineWorkerTime[] = [];
  if (typeof localStorage === "undefined") return rows;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix(userId, farmId))) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) ?? "null") as OfflineWorkerTime;
      if (row?.userId === userId && row?.farmId === farmId && row?.id) rows.push(row);
    } catch {}
  }
  return rows.sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt));
}

export function storeWorkerTime(row: OfflineWorkerTime) {
  localStorage.setItem(prefix(row.userId,row.farmId)+row.id, JSON.stringify(row));
}

export function removeWorkerTime(row: OfflineWorkerTime) {
  localStorage.removeItem(prefix(row.userId,row.farmId)+row.id);
}

export function activeQueuedWorkerTime(userId: string, farmId: string) {
  return queuedWorkerTimes(userId,farmId).find((row)=>!row.clockOut) ?? null;
}

export async function syncWorkerTimes(
  supabase: any,
  userId: string,
  farmId: string,
) {
  for (const row of queuedWorkerTimes(userId,farmId)) {
    if (row.mode === "insert") {
      const { error } = await supabase.from("time_entries").upsert({
        id: row.id,
        farm_id: farmId,
        worker_user_id: userId,
        job: row.job,
        field_name: row.fieldName,
        clock_in: row.clockIn,
        clock_out: row.clockOut,
        clock_in_lat: row.clockInLat,
        clock_in_lng: row.clockInLng,
        clock_in_accuracy_m: row.clockInAccuracyM,
        clock_out_lat: row.clockOutLat,
        clock_out_lng: row.clockOutLng,
        clock_out_accuracy_m: row.clockOutAccuracyM,
        approval_status: "pending",
      }, { onConflict: "id" });
      if (error) throw error;
    } else {
      if (!row.clockOut) continue;
      const { data, error } = await supabase
        .from("time_entries")
        .update({
          clock_out: row.clockOut,
          clock_out_lat: row.clockOutLat,
          clock_out_lng: row.clockOutLng,
          clock_out_accuracy_m: row.clockOutAccuracyM,
        })
        .eq("id", row.id)
        .eq("farm_id", farmId)
        .eq("worker_user_id", userId)
        .is("clock_out", null)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        const existing = await supabase
          .from("time_entries")
          .select("id,clock_out")
          .eq("id",row.id)
          .eq("farm_id",farmId)
          .eq("worker_user_id",userId)
          .maybeSingle();
        if (existing.error || !existing.data?.clock_out)
          throw existing.error ?? new Error("Queued clock-out could not be reconciled.");
      }
    }
    removeWorkerTime(row);
  }
}
