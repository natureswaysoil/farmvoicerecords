export type H2aDailyRow = Record<string, unknown> & {
  id: string;
  farm_id: string;
  worker_id: string;
  work_date: string;
};

export type EvidenceIdRemap = {
  fromRecordId: string;
  toRecordId: string;
};

export type OfflineH2aDailyBatch = {
  id: string;
  farmId: string;
  userId: string;
  queuedAt: string;
  rows: H2aDailyRow[];
  evidenceRemaps?: EvidenceIdRemap[];
};

const v2Prefix = (userId:string,farmId:string) =>
  `farmvoice-h2a-daily-v2:${userId}:${farmId}:`;
const v1Prefix = (userId:string,farmId:string) =>
  `farmvoice-h2a-daily-v1:${userId}:${farmId}:`;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function parseBatch(value:string|null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as OfflineH2aDailyBatch;
  } catch {
    return null;
  }
}

function normalizeBatch(
  batch: Omit<OfflineH2aDailyBatch,"rows"> & {
    rows:Array<Record<string,unknown>>;
  },
): OfflineH2aDailyBatch {
  const remaps = new Map<string,string>(
    (batch.evidenceRemaps ?? []).map((item)=>[
      item.fromRecordId,
      item.toRecordId,
    ]),
  );
  const rows = batch.rows.map((row)=>{
    const priorId = typeof row.id === "string" ? row.id : "";
    const id = isUuid(priorId) ? priorId : crypto.randomUUID();
    if (priorId && priorId !== id) remaps.set(priorId,id);
    return {
      ...row,
      id,
      farm_id:String(row.farm_id ?? batch.farmId),
      worker_id:String(row.worker_id ?? ""),
      work_date:String(row.work_date ?? ""),
    } as H2aDailyRow;
  });
  return {
    ...batch,
    rows,
    evidenceRemaps:[...remaps.entries()].map(([fromRecordId,toRecordId])=>({
      fromRecordId,
      toRecordId,
    })),
  };
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
      | (Omit<OfflineH2aDailyBatch,"rows"> & {
          rows:Array<Record<string,unknown>>;
        })
      | null;
    if (
      !legacy?.id ||
      legacy.userId!==userId ||
      legacy.farmId!==farmId ||
      !Array.isArray(legacy.rows)
    ) continue;

    const migrated=normalizeBatch(legacy);
    localStorage.setItem(
      v2Prefix(userId,farmId)+migrated.id,
      JSON.stringify(migrated),
    );
    localStorage.removeItem(key);
  }
}

function repairV2Batch(
  key:string,
  value:OfflineH2aDailyBatch,
):OfflineH2aDailyBatch {
  const normalized=normalizeBatch(value);
  const changed=
    JSON.stringify(normalized.rows)!==JSON.stringify(value.rows) ||
    JSON.stringify(normalized.evidenceRemaps ?? [])!==
      JSON.stringify(value.evidenceRemaps ?? []);
  if (changed) localStorage.setItem(key,JSON.stringify(normalized));
  return normalized;
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
    ) rows.push(repairV2Batch(key,value));
  }
  return rows.sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt));
}

export function storeH2aDailyBatch(batch:OfflineH2aDailyBatch) {
  localStorage.setItem(
    v2Prefix(batch.userId,batch.farmId)+batch.id,
    JSON.stringify(normalizeBatch(batch)),
  );
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
  "shift_minutes",
  "paid_break_minutes",
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

const existingSelect = [
  "id",
  "worker_id",
  "work_date",
  ...mutableDailyFields,
].join(",");

const numericDailyFields = new Set<string>([
  "hours_offered",
  "shift_minutes",
  "paid_break_minutes",
  "break_minutes",
  "hours_worked",
  "piece_quantity",
  "piece_rate",
  "gps_lat",
  "gps_lng",
  "gps_accuracy_m",
]);
const timestampDailyFields = new Set<string>([
  "gps_captured_at",
  "locked_at",
  "crew_leader_attested_at",
]);

function normalizedComparable(key:string,value: unknown) {
  if (value == null || value === "") return "";
  if (numericDailyFields.has(key)) {
    const number=Number(value);
    return Number.isFinite(number) ? String(number) : String(value);
  }
  if (timestampDailyFields.has(key)) {
    const time=Date.parse(String(value));
    return Number.isFinite(time) ? String(time) : String(value);
  }
  return String(value);
}

function sameMutablePayload(server:Record<string,unknown>,row:H2aDailyRow) {
  return mutableDailyFields.every(
    (key)=>
      normalizedComparable(key,server[key])===
      normalizedComparable(key,row[key]),
  );
}

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
    .select(existingSelect)
    .eq("farm_id",farmId)
    .in("worker_id",workerIds)
    .in("work_date",workDates);
  if (existingResult.error) throw existingResult.error;

  const existingByKey=new Map<string,Record<string,unknown>>(
    (existingResult.data ?? []).map((row:any)=>[
      `${row.worker_id}:${row.work_date}`,
      row as Record<string,unknown>,
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
    const existing=existingByKey.get(key);
    if (!existing) {
      inserts.push(row);
      continue;
    }
    const serverId=String(existing.id);
    if (serverId===row.id && sameMutablePayload(existing,row)) continue;
    reconciliations.push({localId:row.id,serverId,row});
  }

  if (inserts.length) {
    const inserted=await supabase
      .from("h2a_daily_records")
      .insert(inserts)
      .select("id");
    if (inserted.error) {
      if (inserted.error.code!=="23505" || conflictRetry) throw inserted.error;
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
      throw new Error(
        "H-2A daily record insert count did not match the queued batch.",
      );
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
      if (serverId!==localId && remapEvidence)
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
    if (remapEvidence) {
      for (const remap of batch.evidenceRemaps ?? []) {
        await remapEvidence(
          farmId,
          userId,
          remap.fromRecordId,
          remap.toRecordId,
        );
      }
    }
    await saveH2aDailyRows(
      supabase,
      userId,
      farmId,
      batch.rows,
      remapEvidence,
    );
    removeH2aDailyBatch(batch);
  }
}
