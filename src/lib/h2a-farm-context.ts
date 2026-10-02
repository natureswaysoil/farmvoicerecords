import type { SupabaseClient } from "@supabase/supabase-js";
import { getFarmContexts, rememberFarmSelection, type FarmContext } from "@/src/lib/farm-cloud";

export type H2aFarmChoice = FarmContext & { name: string };

export async function loadH2aFarmChoices(supabase: SupabaseClient): Promise<H2aFarmChoice[]> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  const cacheKey = userId ? `farmvoice-h2a-farms:${userId}` : "";
  if (typeof navigator !== "undefined" && !navigator.onLine && cacheKey) {
    try {
      return JSON.parse(localStorage.getItem(cacheKey) ?? "[]") as H2aFarmChoice[];
    } catch {
      return [];
    }
  }

  const contexts = await getFarmContexts(supabase);
  if (!contexts.length) return [];

  const ids = contexts.map((c) => c.farmId);
  const { data, error } = await supabase.from("farms").select("id,name").in("id", ids);
  if (error) throw error;

  const names = new Map((data ?? []).map((row) => [row.id as string, row.name as string]));
  const choices = contexts.map((c) => ({ ...c, name: names.get(c.farmId) ?? "Farm" }));
  if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(choices));
  return choices;
}

export function pickH2aFarm(choices: H2aFarmChoice[]): H2aFarmChoice | null {
  if (!choices.length) return null;
  if (choices.length === 1) return choices[0];

  const remembered =
    typeof window !== "undefined" ? window.localStorage.getItem("farmvoice_selected_farm_id") : null;

  return choices.find((c) => c.farmId === remembered) ?? null;
}

export function selectH2aFarm(farmId: string) {
  rememberFarmSelection(farmId);
}
