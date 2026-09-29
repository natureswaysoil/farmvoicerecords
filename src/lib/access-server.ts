import { createClient } from "@/src/lib/supabase/server";
import { getFarmContexts } from "@/src/lib/farm-cloud";

export class AccessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function authorizeFarm(farmId: string, ownerOnly = false) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AccessError("Sign in is required.", 401);
  const farm = (await getFarmContexts(supabase)).find(
    (f) => f.farmId === farmId,
  );
  if (!farm || (ownerOnly && farm.role !== "owner"))
    throw new AccessError("Farm access is required.", 403);
  return { supabase, user: data.user, farm };
}
export async function requirePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  farmId: string,
  feature = "core",
) {
  const { data, error } = await supabase.rpc("farm_plan_access", {
    p_farm_id: farmId,
    p_feature: feature,
  });
  if (error)
    throw new AccessError(
      "Subscription service is unavailable. Your records remain available to view and export.",
      503,
    );
  if (!data)
    throw new AccessError(
      "Your trial or subscription does not cover this action. Open Pricing to manage your plan.",
      402,
    );
}
export function apiError(error: unknown) {
  if (error instanceof SyntaxError)
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  return Response.json(
    {
      error:
        error instanceof AccessError
          ? error.message
          : "The request could not be completed. Please retry.",
    },
    { status: error instanceof AccessError ? error.status : 500 },
  );
}
