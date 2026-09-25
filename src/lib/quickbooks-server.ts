import { createClient } from "@/src/lib/supabase/server";
import {
  decryptSecret,
  encryptSecret,
  qboRequest,
  refreshQuickBooksToken,
  tokenExpiry,
} from "@/src/lib/quickbooks";

export async function requireFarmOwner() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in is required.");

  const { data: membership, error } = await supabase
    .from("farm_members")
    .select("farm_id, role")
    .eq("user_id", userData.user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (error || !membership) throw new Error("Farm owner access is required.");
  return { supabase, user: userData.user, farmId: membership.farm_id as string };
}

export async function getQuickBooksConnection() {
  const ctx = await requireFarmOwner();
  const { data, error } = await ctx.supabase
    .from("quickbooks_connections")
    .select("*")
    .eq("farm_id", ctx.farmId)
    .maybeSingle();
  if (error) throw error;
  return { ...ctx, connection: data };
}

export async function getValidQuickBooksAccessToken() {
  const ctx = await getQuickBooksConnection();
  if (!ctx.connection) throw new Error("QuickBooks is not connected.");

  const expiresAt = new Date(ctx.connection.access_token_expires_at).getTime();
  if (expiresAt > Date.now() + 90_000) {
    return {
      ...ctx,
      accessToken: decryptSecret(ctx.connection.access_token_ciphertext),
    };
  }

  const refreshed = await refreshQuickBooksToken(
    decryptSecret(ctx.connection.refresh_token_ciphertext)
  );

  const updates = {
    access_token_ciphertext: encryptSecret(refreshed.access_token),
    refresh_token_ciphertext: encryptSecret(refreshed.refresh_token),
    access_token_expires_at: tokenExpiry(refreshed.expires_in),
    refresh_token_expires_at: refreshed.x_refresh_token_expires_in
      ? tokenExpiry(refreshed.x_refresh_token_expires_in)
      : ctx.connection.refresh_token_expires_at,
    updated_at: new Date().toISOString(),
  };

  const { error } = await ctx.supabase
    .from("quickbooks_connections")
    .update(updates)
    .eq("farm_id", ctx.farmId);
  if (error) throw error;

  return { ...ctx, connection: { ...ctx.connection, ...updates }, accessToken: refreshed.access_token };
}

export async function loadQuickBooksEmployees() {
  const ctx = await getValidQuickBooksAccessToken();
  const query = encodeURIComponent("select Id, DisplayName, Active from Employee where Active = true");
  const body = await qboRequest<{
    QueryResponse?: { Employee?: Array<{ Id: string; DisplayName: string; Active?: boolean }> };
  }>(ctx.connection.realm_id, ctx.accessToken, `/query?query=${query}`);
  return body.QueryResponse?.Employee ?? [];
}
