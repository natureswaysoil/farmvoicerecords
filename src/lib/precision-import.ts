export type PrecisionOperationType = "application" | "harvest" | "planting" | "other";

export type ParsedPrecisionSample = {
  sequenceNo: number;
  recordedAt: string | null;
  lat: number;
  lng: number;
  applicationRate: number | null;
  applicationRateUnit: string | null;
  yieldValue: number | null;
  yieldUnit: string | null;
  moisturePct: number | null;
  speedValue: number | null;
  speedUnit: string | null;
  productName: string | null;
  raw: Record<string, unknown>;
};

export type ParsedPrecisionOperation = {
  key: string;
  externalId: string | null;
  operationType: PrecisionOperationType;
  fieldName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  crop: string | null;
  machineName: string | null;
  implementName: string | null;
  operatorName: string | null;
  acres: number | null;
  productName: string | null;
  productRate: number | null;
  productRateUnit: string | null;
  totalProduct: number | null;
  totalProductUnit: string | null;
  averageYield: number | null;
  yieldUnit: string | null;
  totalYield: number | null;
  totalYieldUnit: string | null;
  averageMoisturePct: number | null;
  centroidLat: number | null;
  centroidLng: number | null;
  geometryGeojson: unknown | null;
  rawSummary: Record<string, unknown>;
  samples: ParsedPrecisionSample[];
};

const aliases: Record<string, string[]> = {
  operationId: ["operation id","operationid","job id","jobid","task id","taskid","record id","recordid"],
  operationType: ["operation","operation type","operationtype","type","task"],
  field: ["field","field name","fieldname","field_name","fieldname"],
  date: ["date","operation date","application date","harvest date","timestamp","time","datetime","start time","started at"],
  endDate: ["end time","ended at","end date","finish time"],
  crop: ["crop","commodity","crop name"],
  machine: ["machine","machine name","equipment","vehicle","combine","sprayer"],
  implement: ["implement","implement name","tool"],
  operator: ["operator","operator name","driver","applicator"],
  acres: ["acres","area","area acres","acres covered","harvested acres","treated acres"],
  product: ["product","product name","material","chemical","input","tank mix","tankmix"],
  rate: ["rate","application rate","applied rate","rate/ac","rate per acre","product rate"],
  rateUnit: ["rate unit","application rate unit","rate units","rateunit"],
  totalProduct: ["total product","total material","amount applied","total applied"],
  totalProductUnit: ["total product unit","amount unit","total material unit"],
  yield: ["yield","average yield","avg yield","yield/ac","yield per acre","bushels/acre","bushels per acre","bu/ac","bpa"],
  yieldUnit: ["yield unit","yield units"],
  totalYield: ["total yield","total bushels","bushels","production"],
  totalYieldUnit: ["total yield unit","total production unit"],
  moisture: ["moisture","moisture %","moisture pct","moisture percent","average moisture","avg moisture"],
  lat: ["lat","latitude","gps lat","gps latitude"],
  lng: ["lng","lon","long","longitude","gps lng","gps lon","gps longitude"],
  speed: ["speed","ground speed","machine speed"],
  speedUnit: ["speed unit","speed units"],
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function headerIndex(headers: string[], key: string) {
  const normalized = headers.map(normalizeHeader);
  const candidates = aliases[key] ?? [];
  for (const candidate of candidates) {
    const index = normalized.indexOf(normalizeHeader(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

function valueAt(row: string[], headers: string[], key: string) {
  const index = headerIndex(headers, key);
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").replace(/%$/,"").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/,""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.replace(/\r$/,""));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function inferOperationType(row: string[], headers: string[]): PrecisionOperationType {
  const explicit = valueAt(row, headers, "operationType").toLowerCase();
  if (/spray|application|apply|fertiliz|chemical|herbicide|fungicide|insecticide/.test(explicit))
    return "application";
  if (/harvest|combine|yield/.test(explicit)) return "harvest";
  if (/plant|seed/.test(explicit)) return "planting";
  if (valueAt(row, headers, "yield")) return "harvest";
  if (valueAt(row, headers, "rate") || valueAt(row, headers, "product"))
    return "application";
  return "other";
}

function operationKey(row: string[], headers: string[], type: PrecisionOperationType) {
  const external = valueAt(row, headers, "operationId");
  if (external) return `id:${external}`;
  const field = valueAt(row, headers, "field") || "unknown-field";
  const date = (isoOrNull(valueAt(row, headers, "date")) ?? "").slice(0,10) || "unknown-date";
  const product = valueAt(row, headers, "product") || "";
  const machine = valueAt(row, headers, "machine") || "";
  return [type, field, date, product, machine].map((v)=>v.toLowerCase()).join("|");
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum,value)=>sum+value,0)/valid.length : null;
}

function sum(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum,value)=>sum+value,0) : null;
}

export function parsePrecisionCsv(text: string): ParsedPrecisionOperation[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const headers = rows[0];
  const grouped = new Map<string, { type: PrecisionOperationType; rows: string[][] }>();
  for (const row of rows.slice(1)) {
    const type = inferOperationType(row, headers);
    const key = operationKey(row, headers, type);
    const current = grouped.get(key) ?? { type, rows: [] };
    current.rows.push(row);
    grouped.set(key,current);
  }

  return [...grouped.entries()].map(([key, group]) => {
    const first = group.rows[0];
    const samples: ParsedPrecisionSample[] = group.rows.flatMap((row,index)=>{
      const lat = numberOrNull(valueAt(row,headers,"lat"));
      const lng = numberOrNull(valueAt(row,headers,"lng"));
      if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return [];
      return [{
        sequenceNo:index,
        recordedAt:isoOrNull(valueAt(row,headers,"date")),
        lat,
        lng,
        applicationRate:numberOrNull(valueAt(row,headers,"rate")),
        applicationRateUnit:valueAt(row,headers,"rateUnit") || null,
        yieldValue:numberOrNull(valueAt(row,headers,"yield")),
        yieldUnit:valueAt(row,headers,"yieldUnit") || null,
        moisturePct:numberOrNull(valueAt(row,headers,"moisture")),
        speedValue:numberOrNull(valueAt(row,headers,"speed")),
        speedUnit:valueAt(row,headers,"speedUnit") || null,
        productName:valueAt(row,headers,"product") || null,
        raw:Object.fromEntries(headers.map((header,i)=>[header,row[i] ?? ""])),
      }];
    });

    const latValues = samples.map((sample)=>sample.lat);
    const lngValues = samples.map((sample)=>sample.lng);
    const acres = average(group.rows.map((row)=>numberOrNull(valueAt(row,headers,"acres"))));
    const rate = average(group.rows.map((row)=>numberOrNull(valueAt(row,headers,"rate"))));
    const yieldValues = group.rows.map((row)=>numberOrNull(valueAt(row,headers,"yield")));
    const totalProductValues = group.rows.map((row)=>numberOrNull(valueAt(row,headers,"totalProduct")));
    const totalYieldValues = group.rows.map((row)=>numberOrNull(valueAt(row,headers,"totalYield")));
    const moistureValues = group.rows.map((row)=>numberOrNull(valueAt(row,headers,"moisture")));

    return {
      key,
      externalId:valueAt(first,headers,"operationId") || null,
      operationType:group.type,
      fieldName:valueAt(first,headers,"field") || null,
      startedAt:isoOrNull(valueAt(first,headers,"date")),
      endedAt:isoOrNull(valueAt(first,headers,"endDate")),
      crop:valueAt(first,headers,"crop") || null,
      machineName:valueAt(first,headers,"machine") || null,
      implementName:valueAt(first,headers,"implement") || null,
      operatorName:valueAt(first,headers,"operator") || null,
      acres,
      productName:valueAt(first,headers,"product") || null,
      productRate:rate,
      productRateUnit:valueAt(first,headers,"rateUnit") || null,
      totalProduct:sum(totalProductValues),
      totalProductUnit:valueAt(first,headers,"totalProductUnit") || null,
      averageYield:average(yieldValues),
      yieldUnit:valueAt(first,headers,"yieldUnit") || (group.type==="harvest" ? "bu/ac" : null),
      totalYield:sum(totalYieldValues),
      totalYieldUnit:valueAt(first,headers,"totalYieldUnit") || (group.type==="harvest" ? "bu" : null),
      averageMoisturePct:average(moistureValues),
      centroidLat:latValues.length ? average(latValues) : null,
      centroidLng:lngValues.length ? average(lngValues) : null,
      geometryGeojson:null,
      rawSummary:Object.fromEntries(headers.map((header,i)=>[header,first[i] ?? ""])),
      samples,
    };
  });
}

function geojsonFeatures(value: unknown): any[] {
  if (!value || typeof value !== "object") return [];
  const object = value as any;
  if (object.type === "FeatureCollection" && Array.isArray(object.features))
    return object.features;
  if (object.type === "Feature") return [object];
  return [];
}

function coordsFromGeometry(geometry: any): Array<[number,number]> {
  const out:Array<[number,number]> = [];
  const walk=(value:any)=>{
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      Number.isFinite(Number(value[0])) &&
      Number.isFinite(Number(value[1]))
    ) {
      out.push([Number(value[0]),Number(value[1])]);
      return;
    }
    for (const item of value) walk(item);
  };
  walk(geometry?.coordinates);
  return out.filter(([lng,lat])=>lng>=-180&&lng<=180&&lat>=-90&&lat<=90);
}

export function parsePrecisionGeoJson(text: string): ParsedPrecisionOperation[] {
  const parsed = JSON.parse(text);
  const features = geojsonFeatures(parsed);
  if (!features.length) throw new Error("GeoJSON must contain one or more Features.");
  return features.map((feature,index)=>{
    const p = feature.properties ?? {};
    const textValue=(...keys:string[])=>{
      for (const key of keys) if (p[key] != null && String(p[key]).trim()) return String(p[key]).trim();
      return "";
    };
    const numeric=(...keys:string[])=>{
      for (const key of keys) {
        const value=numberOrNull(p[key]);
        if(value!=null) return value;
      }
      return null;
    };
    const explicit=textValue("operationType","operation_type","operation","type").toLowerCase();
    const operationType:PrecisionOperationType =
      /harvest|yield|combine/.test(explicit) || numeric("yield","averageYield","yield_bu_ac") != null
        ? "harvest"
        : /plant|seed/.test(explicit)
          ? "planting"
          : /apply|application|spray|fertiliz/.test(explicit) || numeric("rate","applicationRate") != null
            ? "application"
            : "other";
    const coords=coordsFromGeometry(feature.geometry);
    const latValues=coords.map(([,lat])=>lat);
    const lngValues=coords.map(([lng])=>lng);
    const samples=coords.slice(0,5000).map(([lng,lat],sequenceNo)=>({
      sequenceNo,
      recordedAt:isoOrNull(textValue("timestamp","date","startedAt","started_at")),
      lat,lng,
      applicationRate:numeric("rate","applicationRate","application_rate"),
      applicationRateUnit:textValue("rateUnit","rate_unit") || null,
      yieldValue:numeric("yield","averageYield","yield_bu_ac"),
      yieldUnit:textValue("yieldUnit","yield_unit") || (operationType==="harvest" ? "bu/ac" : null),
      moisturePct:numeric("moisture","moisturePct","moisture_pct"),
      speedValue:numeric("speed"),
      speedUnit:textValue("speedUnit","speed_unit") || null,
      productName:textValue("product","productName","product_name") || null,
      raw:p,
    }));
    return {
      key:textValue("operationId","operation_id","id") || `feature:${index}`,
      externalId:textValue("operationId","operation_id","id") || null,
      operationType,
      fieldName:textValue("field","fieldName","field_name") || null,
      startedAt:isoOrNull(textValue("timestamp","date","startedAt","started_at")),
      endedAt:isoOrNull(textValue("endedAt","ended_at","endDate","end_date")),
      crop:textValue("crop","commodity") || null,
      machineName:textValue("machine","machineName","equipment") || null,
      implementName:textValue("implement","implementName") || null,
      operatorName:textValue("operator","operatorName") || null,
      acres:numeric("acres","areaAcres","area_acres"),
      productName:textValue("product","productName","product_name") || null,
      productRate:numeric("rate","applicationRate","application_rate"),
      productRateUnit:textValue("rateUnit","rate_unit") || null,
      totalProduct:numeric("totalProduct","total_product","amountApplied"),
      totalProductUnit:textValue("totalProductUnit","total_product_unit","amountUnit") || null,
      averageYield:numeric("yield","averageYield","average_yield","yield_bu_ac"),
      yieldUnit:textValue("yieldUnit","yield_unit") || (operationType==="harvest" ? "bu/ac" : null),
      totalYield:numeric("totalYield","total_yield","bushels"),
      totalYieldUnit:textValue("totalYieldUnit","total_yield_unit") || (operationType==="harvest" ? "bu" : null),
      averageMoisturePct:numeric("moisture","moisturePct","moisture_pct"),
      centroidLat:latValues.length ? average(latValues) : null,
      centroidLng:lngValues.length ? average(lngValues) : null,
      geometryGeojson:feature.geometry ?? null,
      rawSummary:p,
      samples,
    };
  });
}

export function normalizeFieldName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g," ");
}

export function matchFieldId(
  sourceName: string | null,
  fields: Array<{id:string;name:string}>,
) {
  if (!sourceName) return null;
  const target=normalizeFieldName(sourceName);
  return fields.find((field)=>normalizeFieldName(field.name)===target)?.id ?? null;
}

export function applicationDraftPayload(operation: ParsedPrecisionOperation) {
  if (operation.operationType !== "application") return null;
  return {
    applicatorName: operation.operatorName ?? "",
    certificationNumber: "",
    productName: operation.productName ?? "",
    epaRegNumber: "",
    amountApplied: operation.totalProduct ?? "",
    amountUnit: operation.totalProductUnit ?? "",
    cropOrSite: operation.crop ?? "",
    fieldLocation: operation.fieldName ?? "",
    areaTreated: operation.acres ?? "",
    areaUnit: operation.acres != null ? "acres" : "",
    applicationDate: operation.startedAt?.slice(0,10) ?? "",
    isRestrictedUse: false,
    equipmentSource: operation.rawSummary,
    equipmentApplicationRate: operation.productRate,
    equipmentApplicationRateUnit: operation.productRateUnit,
    equipmentMachine: operation.machineName,
    equipmentImplement: operation.implementName,
    equipmentOperationId: operation.externalId,
  };
}
