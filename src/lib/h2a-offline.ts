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

const v2Prefix = (userId:string,farmId:string) =>
  `farmvoice-h2a-daily-v2:${userId}:${farmId}:`;
const v1Prefix = (userId:string,farmId:string) =>
  `farmvoice-h2a-daily-v1:${userId}:${farmId}:`;

function parseBatch(value:string|null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as OfflineH2aDailyBatch;
  } catch {
    return null;
  }
}

function migrateLegacyBatches(userId:string,farmId:string) {
  if (typeof localStorage === "undefined") return;
  const legacyKeys:string[] = [];
  for (let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);
    if (key?.startsWith(v1Prefix(userId,farmId))) legacyKeys.push(key);
  }

  for (const key of legacyKeys) {
    const legacy=parseBatch(localStorage.getItem(key)) as
      | (Omit<OfflineH2aDailyBatch,"rows"> & {rows:Array<Record<string,unknown>>})
      | null;
    if (
      !legacy?.id ||
      legacy.userId!==userId ||
      legacy.farmId!==farmId ||
      !Array.isArray(legacy.rows)
    ) continue;

    const migrated:OfflineH2aDailyBatch = {
      ...legacy,
      rows: legacy.rows.map((row)=>({
        ...row,
        id:
          typeof row.id === "string" && row.id
            ? row.id
            : crypto.randomUUID(),
        farm_id:String(row.farm_id ?? farmId),
        worker_id:String(row.worker_id ?? ""),
        work_date:String(row.work_date ?? ""),
      })),
    };
    localStorage.setItem(
      v2Prefix(userId,farmId)+migrated.id,
      JSON.stringify(migrated),
    );
    localStorage.removeItem(key);
  }
}

export function h2aDailyBatches(userId:string,farmId:string) {
  const rows: OfflineH2aDailyBatch[] = [];
  if (typeof localStorage === "undefined") return rows;
  migrateLegacyBatches(userId,farmId);
  for (let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);
    if (!key?.startsWith(v2Prefix(userId,farmId))) continue;
    const value=parseBatch(localStorage.getItem(key));
    if (
      value?.id &&
      value.userId===userId &&
      value.farmId===farmId &&
      Array.isArray(value.rows)
    ) rows.push(value);
  }
  return rows.sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt));
}

export function storeH2aDailyBatch(batch:OfflineH2aDailyBatch) {
  localStorage.setItem(v2Prefix(batch.userId,batch.farmId)+batch.id,JSON.stringify(batch));
}

export function removeH2aDailyBatch(batch:OfflineH2aDailyBatch) {
  localStorage.removeItem(v2Prefix(batch.userId,batch.farmId)+batch.id);
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

export type EvidenceRecordRemapper = (
  farmId:string,
  userId:string,
  fromRecordId:string,
  toRecordId:string,
) => Promise<number>;

const mutableDailyFields = [
  "contract_id",
  "crew_name",
  "worksite",
  "field_name",
  "job",
  "hours_offered",
  "start_time",
  "end_time",
  "break_minutes",
  "hours_worked",
  "absence_reason",
  "piece_unit",
  "piece_quantity",
  "piece_rate",
  "gps_lat",
  "gps_lng",
  "gps_accuracy_m",
  "gps_captured_at",
  "locked_at",
  "crew_leader_attested_at",
] as const;

function reconciliationPayload(row:H2aDailyRow) {
  const payload:Record<string,unknown> = {
    change_reason:"Offline reconciliation after reconnect",
  };
  for (const key of mutableDailyFields) {
    if (key in row) payload[key]=row[key];
  }
  return payload;
}

export async function saveH2aDailyRows(
  supabase:any,
  userId:string,
  farmId:string,
  rows:H2aDailyRow[],
  remapEvidence?: EvidenceRecordRemapper,
  conflictRetry = false,
) {
  if (!rows.length) return;

  const workerIds=[...new Set(rows.map((row)=>row.worker_id))];
  const workDates=[...new Set(rows.map((row)=>row.work_date))];
  const existingResult=await supabase
    .from("h2a_daily_records")
    .select("id,worker_id,work_date")
    .eq("farm_id",farmId)
    .in("worker_id",workerIds)
    .in("work_date",workDates);
  if (existingResult.error) throw existingResult.error;

  const existingByKey=new Map(
    (existingResult.data ?? []).map((row:any)=>[
      `${row.worker_id}:${row.work_date}`,
      String(row.id),
    ]),
  );

  const inserts:H2aDailyRow[] = [];
  const reconciliations:Array<{
    localId:string;
    serverId:string;
    row:H2aDailyRow;
  }> = [];

  for (const row of rows) {
    const key=`${row.worker_id}:${row.work_date}`;
    const serverId=existingByKey.get(key);
    if (!serverId) {
      inserts.push(row);
      continue;
    }
    if (serverId===row.id) continue;
    reconciliations.push({localId:row.id,serverId,row});
  }

  if (inserts.length) {
    const inserted=await supabase
      .from("h2a_daily_records")
      .insert(inserts)
      .select("id");
    if (inserted.error) {
      if (inserted.error.code!=="23505" || conflictRetry) throw inserted.error;
      // A concurrent/uncertain insert may have committed. Re-run once through
      // reconciliation rather than duplicating or permanently stranding a batch.
      return saveH2aDailyRows(
        supabase,
        userId,
        farmId,
        rows,
        remapEvidence,
        true,
      );
    }
    if ((inserted.data?.length ?? 0)!==inserts.length)
      throw new Error("H-2A daily record insert count did not match the queued batch.");
  }

  await Promise.all(
    reconciliations.map(async ({localId,serverId,row})=>{
      const update=await supabase
        .from("h2a_daily_records")
        .update(reconciliationPayload(row))
        .eq("id",serverId)
        .eq("farm_id",farmId)
        .select("id");
      if (update.error) throw update.error;
      if (!update.data?.length)
        throw new Error("H-2A daily record update could not be reconciled.");
      if (remapEvidence)
        await remapEvidence(farmId,userId,localId,serverId);
    }),
  );
}

export async function syncH2aDailyBatches(
  supabase:any,
  userId:string,
  farmId:string,
  remapEvidence?: EvidenceRecordRemapper,
) {
  for (const batch of h2aDailyBatches(userId,farmId)) {
    await saveH2aDailyRows(supabase,userId,farmId,batch.rows,remapEvidence);
    removeH2aDailyBatch(batch);
  }
}
