import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import shp from "npm:shpjs@6.2.0";

type GeoFeature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown } | null;
  properties?: Record<string, unknown> | null;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
  fileName?: string;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function value(props: Record<string, unknown>, names: string[]) {
  const entries = new Map(Object.entries(props).map(([k, v]) => [k.toUpperCase(), v]));
  for (const name of names) {
    const v = entries.get(name.toUpperCase());
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function numberValue(props: Record<string, unknown>, names: string[]) {
  const raw = value(props, names);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function collections(parsed: unknown): FeatureCollection[] {
  if (Array.isArray(parsed)) return parsed.filter((x): x is FeatureCollection => !!x && typeof x === "object" && (x as FeatureCollection).type === "FeatureCollection");
  if (parsed && typeof parsed === "object" && (parsed as FeatureCollection).type === "FeatureCollection") return [parsed as FeatureCollection];
  if (parsed && typeof parsed === "object" && (parsed as GeoFeature).type === "Feature") {
    return [{ type: "FeatureCollection", features: [parsed as GeoFeature] }];
  }
  throw new Error("The file did not contain a GeoJSON FeatureCollection.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "Your FarmVoice session is not valid." }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected a file upload." }, 400);
  }

  const farmId = String(form.get("farm_id") || "");
  const file = form.get("file");
  if (!farmId) return json({ error: "farm_id is required." }, 400);
  if (!(file instanceof File)) return json({ error: "Choose a USDA shapefile ZIP or GeoJSON file." }, 400);
  if (file.size > 25 * 1024 * 1024) return json({ error: "USDA import files must be 25 MB or smaller." }, 413);

  const { data: ownedFarm, error: ownerError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .eq("owner_user_id", userData.user.id)
    .maybeSingle();

  if (ownerError) return json({ error: ownerError.message }, 400);
  if (!ownedFarm) {
    return json({ error: "Only the canonical farm owner can import USDA field boundaries." }, 403);
  }

  const lowerName = file.name.toLowerCase();
  let parsed: unknown;
  try {
    if (lowerName.endsWith(".geojson") || lowerName.endsWith(".json")) {
      parsed = JSON.parse(await file.text());
    } else if (lowerName.endsWith(".zip")) {
      parsed = await shp(await file.arrayBuffer());
    } else {
      return json({ error: "Use the ZIP shapefile or GeoJSON export from farmers.gov." }, 415);
    }
  } catch (error) {
    return json({ error: `Could not read the USDA boundary file: ${error instanceof Error ? error.message : "invalid file"}` }, 400);
  }

  let groups: FeatureCollection[];
  try {
    groups = collections(parsed);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unsupported geospatial file." }, 400);
  }

  const features = groups.flatMap((group) => group.features || []);
  let skipped = 0;
  const problems: string[] = [];
  const valid = new Map<string, {
    farmNumber: string;
    tractNumber: string;
    fieldNumber: string;
    cluId: string | null;
    stateCode: string | null;
    countyCode: string | null;
    acres: number | null;
    boundary: Record<string, unknown>;
  }>();

  for (const feature of features) {
    const props = feature.properties || {};
    if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
      skipped++;
      continue;
    }

    const farmNumber = value(props, ["FARMNUM", "FARMNBR", "FARM_NUMBER", "FARM"]);
    const tractNumber = value(props, ["TRACTNUM", "TRACTNBR", "TRACT_NUMBER", "TRACT"]);
    const fieldNumber = value(props, ["FIELDNUM", "FIELDNBR", "FIELD_NUMBER", "FIELD", "CLUNBR"]);
    if (!farmNumber || !tractNumber || !fieldNumber) {
      skipped++;
      if (problems.length < 10) problems.push("Skipped a polygon missing FARMNUM, TRACTNUM, or FIELDNUM.");
      continue;
    }

    const cluId = value(props, ["CLUID", "CLU_ID", "ALTCLUID"]);
    const stateCode = value(props, ["LOCSTATE", "ADMSTATE", "STATE"]);
    const countyCode = value(props, ["LOCCNTY", "ADMCNTY", "COUNTY"]);
    const acres = numberValue(props, ["CALCACRE", "CALCACRES", "FSA_ACRES", "ACRES"]);
    const boundary = {
      type: "Feature",
      geometry: feature.geometry,
      properties: { farmNumber, tractNumber, fieldNumber, cluId, stateCode, countyCode },
    };
    const key = `${farmNumber}\u001f${tractNumber}\u001f${fieldNumber}`;

    if (valid.has(key)) {
      skipped++;
      if (problems.length < 10) problems.push(`Skipped duplicate USDA field ${farmNumber}/${tractNumber}/${fieldNumber}.`);
      continue;
    }

    valid.set(key, { farmNumber, tractNumber, fieldNumber, cluId, stateCode, countyCode, acres, boundary });
  }

  if (!valid.size) {
    return json({
      ok: true,
      filename: file.name,
      totalPolygons: features.length,
      inserted: 0,
      updated: 0,
      skipped,
      imported: [],
      problems,
    });
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("fields")
    .select("id,name,area_type,organic_status,created_by,fsa_farm_number,fsa_tract_number,fsa_field_number")
    .eq("farm_id", farmId);

  if (existingError) return json({ error: existingError.message }, 400);

  const existingByKey = new Map(
    (existingRows ?? []).map((row) => [
      `${row.fsa_farm_number}\u001f${row.fsa_tract_number}\u001f${row.fsa_field_number}`,
      row,
    ])
  );

  let inserted = 0;
  let updated = 0;
  const imported: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();
  const rows = Array.from(valid.entries()).map(([key, item]) => {
    const existing = existingByKey.get(key);
    if (existing) updated++;
    else inserted++;

    imported.push({
      id: existing?.id ?? null,
      name: existing?.name ?? `FSA Farm ${item.farmNumber} Tract ${item.tractNumber} Field ${item.fieldNumber}`,
      farmNumber: item.farmNumber,
      tractNumber: item.tractNumber,
      fieldNumber: item.fieldNumber,
      action: existing ? "updated" : "created",
    });

    return {
      farm_id: farmId,
      name: existing?.name ?? `FSA Farm ${item.farmNumber} Tract ${item.tractNumber} Field ${item.fieldNumber}`,
      area_type: existing?.area_type ?? "field",
      organic_status: existing?.organic_status ?? "unknown",
      created_by: existing?.created_by ?? userData.user.id,
      fsa_state_code: item.stateCode,
      fsa_county_code: item.countyCode,
      fsa_farm_number: item.farmNumber,
      fsa_tract_number: item.tractNumber,
      fsa_field_number: item.fieldNumber,
      clu_id: item.cluId,
      size_value: item.acres,
      size_unit: item.acres === null ? null : "acres",
      boundary_geojson: item.boundary,
      boundary_source: "USDA/FSA farmers.gov",
      boundary_source_filename: file.name,
      boundary_imported_at: now,
      updated_at: now,
    };
  });

  const { data: upserted, error: upsertError } = await supabase
    .from("fields")
    .upsert(rows, {
      onConflict: "farm_id,fsa_farm_number,fsa_tract_number,fsa_field_number",
    })
    .select("id,name,fsa_farm_number,fsa_tract_number,fsa_field_number");

  if (upsertError) return json({ error: upsertError.message }, 400);

  const idByKey = new Map(
    (upserted ?? []).map((row) => [
      `${row.fsa_farm_number}\u001f${row.fsa_tract_number}\u001f${row.fsa_field_number}`,
      row.id,
    ])
  );
  for (const item of imported) {
    const key = `${item.farmNumber}\u001f${item.tractNumber}\u001f${item.fieldNumber}`;
    item.id = idByKey.get(key) ?? item.id;
  }

  return json({
    ok: true,
    filename: file.name,
    totalPolygons: features.length,
    inserted,
    updated,
    skipped,
    imported,
    problems,
  });
});