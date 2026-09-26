import crypto from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type EnsureOwnerFarmResult = {
  farmId: string;
  created: boolean;
};

function makeJoinCode() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

export async function ensureOwnerFarm(
  supabase: SupabaseClient,
  user: User
): Promise<EnsureOwnerFarmResult> {
  const { data: membership, error: membershipError } = await supabase
    .from("farm_members")
    .select("farm_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (membership) {
    return { farmId: membership.farm_id as string, created: false };
  }

  const { data: ownedFarm, error: ownedFarmError } = await supabase
    .from("farms")
    .select("id")
    .eq("owner_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (ownedFarmError) throw ownedFarmError;

  let farmId = ownedFarm?.id as string | undefined;
  let created = false;

  if (!farmId) {
    const emailPrefix = user.email?.split("@")[0]?.trim();
    const farmName = emailPrefix ? `${emailPrefix}'s Farm` : "My Farm";

    for (let attempt = 0; attempt < 5 && !farmId; attempt += 1) {
      const { data: farm, error: farmError } = await supabase
        .from("farms")
        .insert({
          name: farmName,
          state: null,
          join_code: makeJoinCode(),
          owner_user_id: user.id,
          timezone: "America/New_York",
        })
        .select("id")
        .single();

      if (!farmError && farm) {
        farmId = farm.id as string;
        created = true;
        break;
      }

      if (farmError?.code !== "23505") throw farmError;
    }
  }

  if (!farmId) {
    throw new Error("Unable to create the farm account.");
  }

  const { error: memberError } = await supabase.from("farm_members").insert({
    farm_id: farmId,
    user_id: user.id,
    role: "owner",
    employee_number: null,
  });

  if (memberError && memberError.code !== "23505") throw memberError;

  return { farmId, created };
}
