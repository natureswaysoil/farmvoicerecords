import { track } from "@vercel/analytics/server";
import crypto from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { selectAuthorizedFarmId } from "@/src/lib/farm-selection";

type EnsureOwnerFarmResult = {
  farmId: string | null;
  created: boolean;
};

export type OwnerFarm = {
  id: string;
  name: string;
};

function makeJoinCode() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

export async function listOwnerFarms(
  supabase: SupabaseClient,
  userId: string,
): Promise<OwnerFarm[]> {
  const { data: memberships, error } = await supabase
    .from("farm_members")
    .select("farm_id")
    .eq("user_id", userId)
    .eq("role", "owner");

  if (error) throw error;
  if (!memberships?.length) return [];

  const ids = [
    ...new Set(memberships.map((membership) => membership.farm_id as string)),
  ];
  const { data: farms, error: farmError } = await supabase
    .from("farms")
    .select("id, name")
    .in("id", ids)
    .order("name");

  if (farmError) throw farmError;
  return (farms ?? []) as OwnerFarm[];
}

export async function requireOwnerFarmId(
  supabase: SupabaseClient,
  userId: string,
  requestedFarmId?: string | null,
) {
  const { data: memberships, error } = await supabase
    .from("farm_members")
    .select("farm_id")
    .eq("user_id", userId)
    .eq("role", "owner");

  if (error) throw error;
  return selectAuthorizedFarmId(
    (memberships ?? []).map((membership) => ({
      farm_id: membership.farm_id as string,
    })),
    requestedFarmId,
  );
}

async function findOwnedFarms(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("farms")
    .select("id")
    .eq("owner_user_id", userId);

  if (error) throw error;
  return (data ?? []).map((farm) => farm.id as string);
}

export async function ensureOwnerFarm(
  supabase: SupabaseClient,
  user: User,
): Promise<EnsureOwnerFarmResult> {
  // Account initialization is intentionally different from privileged owner-farm
  // selection. Any existing membership means this account is already initialized.
  // This prevents worker-only users from accidentally receiving a new farm and lets
  // multi-farm users finish ordinary sign-in without choosing a privileged context.
  const { data: memberships, error: membershipError } = await supabase
    .from("farm_members")
    .select("farm_id, role")
    .eq("user_id", user.id);

  if (membershipError) throw membershipError;
  if (memberships?.length) {
    const farmIds = [
      ...new Set(memberships.map((membership) => membership.farm_id as string)),
    ];
    return {
      farmId: farmIds.length === 1 ? farmIds[0] : null,
      created: false,
    };
  }

  const ownedFarmIds = await findOwnedFarms(supabase, user.id);
  if (ownedFarmIds.length > 1) {
    throw new Error(
      "Multiple owner farms exist without matching owner memberships. Contact FarmVoice support.",
    );
  }

  let farmId = ownedFarmIds[0];
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

      const reread = await findOwnedFarms(supabase, user.id);
      if (reread.length > 1) {
        throw new Error(
          "Multiple owner farms were created concurrently. Contact FarmVoice support.",
        );
      }
      farmId = reread[0];
    }
  }

  if (!farmId) throw new Error("Unable to create the farm account.");

  const { error: memberError } = await supabase.from("farm_members").insert({
    farm_id: farmId,
    user_id: user.id,
    role: "owner",
    employee_number: null,
  });

  if (memberError && memberError.code !== "23505") throw memberError;
  if (created) {
    try {
      await track("trial_started", { source: "farm_created" });
    } catch {
      /* Analytics must not interrupt account creation. */
    }
  }
  return { farmId, created };
}
