import type { SupabaseClient } from "@supabase/supabase-js";

export type FarmContext = {
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

export async function getFarmContext(
  supabase: SupabaseClient
): Promise<FarmContext | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("farm_members")
    .select("farm_id, role")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    userId: userData.user.id,
    farmId: data.farm_id,
    role: data.role as "owner" | "worker",
  };
}

export async function loadCloudFields(
  supabase: SupabaseClient,
  farmId: string
): Promise<CloudField[]> {
  const { data, error } = await supabase
    .from("fields")
    .select("*")
    .eq("farm_id", farmId)
    .eq("active", true)
    .order("name");

  if (error) throw error;
  return (data ?? []) as CloudField[];
}

export async function loadCloudFieldHistory(
  supabase: SupabaseClient,
  farmId: string
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
