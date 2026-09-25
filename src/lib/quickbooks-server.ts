import crypto from "node:crypto";
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

async function releaseRefreshLock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  farmId: string,
  token: string
) {
  await supabase
    .from("quickbooks_connections")
    .update({ refresh_lock_token: null, refresh_lock_expires_at: null })
    .eq("farm_id", farmId)
    .eq("refresh_lock_token", token);
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

  const lockToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await ctx.supabase.rpc(
    "claim_quickbooks_refresh",
    { p_farm_id: ctx.farmId, p_token: lockToken }
  );
  if (claimError) throw claimError;

  if (!claimed) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const { data: reloaded, error: reloadError } = await ctx.supabase
      .from("quickbooks_connections")
      .select("*")
      .eq("farm_id", ctx.farmId)
      .maybeSingle();
    if (reloadError) throw reloadError;
    if (
      reloaded &&
      new Date(reloaded.access_token_expires_at).getTime() > Date.now() + 60_000
    ) {
      return {
        ...ctx,
        connection: reloaded,
        accessToken: decryptSecret(reloaded.access_token_ciphertext),
      };
    }
    throw new Error("QuickBooks token refresh is already in progress. Please retry.");
  }

  try {
    const { data: lockedConnection, error: lockedError } = await ctx.supabase
      .from("quickbooks_connections")
      .select("*")
      .eq("farm_id", ctx.farmId)
      .eq("refresh_lock_token", lockToken)
      .maybeSingle();
    if (lockedError) throw lockedError;
    if (!lockedConnection) throw new Error("QuickBooks refresh lock was lost.");

    if (
      new Date(lockedConnection.access_token_expires_at).getTime() >
      Date.now() + 90_000
    ) {
      await releaseRefreshLock(ctx.supabase, ctx.farmId, lockToken);
      return {
        ...ctx,
        connection: { ...lockedConnection, refresh_lock_token: null, refresh_lock_expires_at: null },
        accessToken: decryptSecret(lockedConnection.access_token_ciphertext),
      };
    }

    const refreshed = await refreshQuickBooksToken(
      decryptSecret(lockedConnection.refresh_token_ciphertext)
    );

    const updates = {
      access_token_ciphertext: encryptSecret(refreshed.access_token),
      refresh_token_ciphertext: encryptSecret(refreshed.refresh_token),
      access_token_expires_at: tokenExpiry(refreshed.expires_in),
      refresh_token_expires_at: refreshed.x_refresh_token_expires_in
        ? tokenExpiry(refreshed.x_refresh_token_expires_in)
        : lockedConnection.refresh_token_expires_at,
      updated_at: new Date().toISOString(),
      refresh_lock_token: null,
      refresh_lock_expires_at: null,
    };

    const { data: saved, error } = await ctx.supabase
      .from("quickbooks_connections")
      .update(updates)
      .eq("farm_id", ctx.farmId)
      .eq("refresh_lock_token", lockToken)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!saved) throw new Error("QuickBooks token refresh result could not be saved.");

    return {
      ...ctx,
      connection: saved,
      accessToken: refreshed.access_token,
    };
  } catch (error) {
    await releaseRefreshLock(ctx.supabase, ctx.farmId, lockToken);
    throw error;
  }
}

export async function loadQuickBooksEmployees() {
  const ctx = await getValidQuickBooksAccessToken();
  const query = encodeURIComponent(
    "select Id, DisplayName, Active from Employee where Active = true"
  );
  const body = await qboRequest<{
    QueryResponse?: {
      Employee?: Array<{ Id: string; DisplayName: string; Active?: boolean }>;
    };
  }>(ctx.connection.realm_id, ctx.accessToken, `/query?query=${query}`);
  return body.QueryResponse?.Employee ?? [];
}
