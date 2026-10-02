import type { SupabaseClient } from "@supabase/supabase-js";

export type FarmContext = {
  farmName?: string;
  userId: string;
  farmId: string;
  role: "owner" | "worker";
};

export type CloudField = {
  id: string;
  farm_id: string;
  name: string;
  area_type: string;
  size_value: number | null;
  size_unit: string | null;
  current_crop: string | null;
  previous_land_use: string | null;
  planting_date: string | null;
  harvest_date: string | null;
  organic_status: string | null;
  buffer_notes: string | null;
  adjoining_land_notes: string | null;
  boundary_notes: string | null;
  management_notes: string | null;
  fsa_state_code: string | null;
  fsa_county_code: string | null;
  fsa_farm_number: string | null;
  fsa_tract_number: string | null;
  fsa_field_number: string | null;
  clu_id: string | null;
  boundary_geojson: unknown | null;
  created_at: string;
};

export type CloudHistoryEvent = {
  id: string;
  field_id: string;
  farm_id: string;
  event_type: string;
  event_date: string | null;
  summary: string;
  created_at: string;
};

export async function getFarmContexts(
  supabase: SupabaseClient,
): Promise<FarmContext[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return [];

  const userId = userData.user.id;
  const [
    { data: memberships, error: memberError },
    { data: ownedFarms, error: ownerError },
  ] = await Promise.all([
    supabase
      .from("farm_members")
      .select("farm_id, role")
      .eq("user_id", userId)
      .order("created_at"),
    supabase
      .from("farms")
      .select("id")
      .eq("owner_user_id", userId)
      .order("created_at"),
  ]);

  if (memberError || ownerError)
    throw new Error("Could not load farm access. Reconnect and retry.");

  const contexts = new Map<string, FarmContext>();

  for (const farm of ownedFarms ?? []) {
    contexts.set(farm.id as string, {
      userId,
      farmId: farm.id as string,
      role: "owner",
    });
  }

  for (const row of memberships ?? []) {
    const farmId = row.farm_id as string;
    if (!contexts.has(farmId)) {
      contexts.set(farmId, {
        userId,
        farmId,
        role: row.role as "owner" | "worker",
      });
    }
  }

  return Array.from(contexts.values());
}

export async function getFarmContext(
  supabase: SupabaseClient,
  preferredFarmId?: string | null,
): Promise<FarmContext | null> {
  const contexts = await getFarmContexts(supabase);
  if (!contexts.length) return null;

  const selected =
    preferredFarmId ||
    (typeof window !== "undefined"
      ? window.localStorage.getItem("farmvoice_selected_farm_id")
      : null);

  return contexts.find((ctx) => ctx.farmId === selected) ?? contexts[0];
}

export function rememberFarmSelection(farmId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("farmvoice_selected_farm_id", farmId);
  }
}

export function cachedFarmContexts(userId: string): FarmContext[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(`farmvoice-contexts:${userId}`) ?? "[]") as FarmContext[];
  } catch {
    return [];
  }
}

export function cachedFields(farmId: string): CloudField[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(`farmvoice-fields:${farmId}`) ?? "[]") as CloudField[];
  } catch {
    return [];
  }
}

export async function loadCloudFields(
  supabase: SupabaseClient,
  farmId: string,
): Promise<CloudField[]> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return cachedFields(farmId);
  const { data, error } = await supabase
    .from("fields")
    .select("*")
    .eq("farm_id", farmId)
    .eq("active", true)
    .order("fsa_tract_number")
    .order("fsa_field_number");

  if (error) throw error;
  const rows = (data ?? []) as CloudField[];
  if (typeof window !== "undefined")
    window.localStorage.setItem(`farmvoice-fields:${farmId}`, JSON.stringify(rows));
  return rows;
}

export async function loadCloudFieldHistory(
  supabase: SupabaseClient,
  farmId: string,
): Promise<CloudHistoryEvent[]> {
  const { data, error } = await supabase
    .from("field_history_events")
    .select("*")
    .eq("farm_id", farmId)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CloudHistoryEvent[];
}

export async function getNamedFarmContexts(
  supabase: SupabaseClient,
): Promise<FarmContext[]> {
  const { data: session } = await supabase.auth.getSession();
  const sessionUserId = session.session?.user.id;
  if (typeof navigator !== "undefined" && !navigator.onLine && sessionUserId)
    return cachedFarmContexts(sessionUserId);
  const contexts = await getFarmContexts(supabase);
  if (!contexts.length) return contexts;
  const { data } = await supabase
    .from("farms")
    .select("id,name")
    .in(
      "id",
      contexts.map((c) => c.farmId),
    );
  const names = new Map((data ?? []).map((f) => [f.id, f.name]));
  const named = contexts.map((c) => ({ ...c, farmName: names.get(c.farmId) }));
  if (typeof window !== "undefined" && named[0]?.userId)
    window.localStorage.setItem(`farmvoice-contexts:${named[0].userId}`, JSON.stringify(named));
  return named;
}
