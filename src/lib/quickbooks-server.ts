import crypto from "node:crypto";
import { createClient } from "@/src/lib/supabase/server";
import { requireOwnerFarmId } from "@/src/lib/farm-owner-server";
import {
  decryptSecret,
  encryptSecret,
  isQuickBooksApiError,
  qboRequest,
  refreshQuickBooksToken,
  tokenExpiry,
} from "@/src/lib/quickbooks";

export async function requireFarmOwner(requestedFarmId?: string | null) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in is required.");

  const farmId = await requireOwnerFarmId(supabase, userData.user.id, requestedFarmId);
  return { supabase, user: userData.user, farmId };
}

export async function getQuickBooksConnection(requestedFarmId?: string | null) {
  const ctx = await requireFarmOwner(requestedFarmId);
  const { data, error } = await ctx.supabase
    .from("quickbooks_connections")
    .select("*")
    .eq("farm_id", ctx.farmId)
    .maybeSingle();
  if (error) throw error;
  return { ...ctx, connection: data };
}

export async function logQuickBooksError(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  farmId: string;
  operation: string;
  endpoint?: string | null;
  error: unknown;
  context?: Record<string, unknown>;
}) {
  const qb = isQuickBooksApiError(args.error) ? args.error : null;
  const message = args.error instanceof Error ? args.error.message : "Unknown QuickBooks error";

  const { error } = await args.supabase.from("quickbooks_error_logs").insert({
    farm_id: args.farmId,
    operation: args.operation,
    endpoint: args.endpoint ?? null,
    http_status: qb?.status ?? null,
    intuit_tid: qb?.intuitTid ?? null,
    error_code: qb?.code ?? null,
    error_message: message.slice(0, 2000),
    error_detail: qb?.detail?.slice(0, 4000) ?? null,
    reconnect_required: qb?.reconnectRequired ?? false,
    context: args.context ?? {},
  });

  if (error) {
    console.error("Unable to store QuickBooks error log", {
      farmId: args.farmId,
      operation: args.operation,
      message: error.message,
    });
  }

  return {
    intuitTid: qb?.intuitTid ?? null,
    reconnectRequired: qb?.reconnectRequired ?? false,
    code: qb?.code ?? null,
    message,
  };
}

async function markReconnectRequired(
  supabase: Awaited<ReturnType<typeof createClient>>,
  farmId: string,
  error: unknown
) {
  if (!isQuickBooksApiError(error) || !error.reconnectRequired) return;

  await supabase
    .from("quickbooks_connections")
    .update({
      reconnect_required: true,
      last_auth_error: error.message.slice(0, 2000),
      last_auth_error_at: new Date().toISOString(),
      last_intuit_tid: error.intuitTid,
      last_api_at: new Date().toISOString(),
      refresh_lock_token: null,
      refresh_lock_expires_at: null,
    })
    .eq("farm_id", farmId);
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

export async function getValidQuickBooksAccessToken(requestedFarmId?: string | null) {
  const ctx = await getQuickBooksConnection(requestedFarmId);
  if (!ctx.connection) throw new Error("QuickBooks is not connected.");
  if (ctx.connection.reconnect_required) {
    throw new Error("QuickBooks authorization needs to be reconnected.");
  }

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
    if (reloaded?.reconnect_required) {
      throw new Error("QuickBooks authorization needs to be reconnected.");
    }
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
      access_token_ciphertext: encryptSecret(refreshed.data.access_token),
      refresh_token_ciphertext: encryptSecret(refreshed.data.refresh_token),
      access_token_expires_at: tokenExpiry(refreshed.data.expires_in),
      refresh_token_expires_at: refreshed.data.x_refresh_token_expires_in
        ? tokenExpiry(refreshed.data.x_refresh_token_expires_in)
        : lockedConnection.refresh_token_expires_at,
      updated_at: new Date().toISOString(),
      reconnect_required: false,
      last_auth_error: null,
      last_auth_error_at: null,
      last_intuit_tid: refreshed.intuitTid,
      last_api_at: new Date().toISOString(),
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
      accessToken: refreshed.data.access_token,
    };
  } catch (error) {
    await markReconnectRequired(ctx.supabase, ctx.farmId, error);
    await logQuickBooksError({
      supabase: ctx.supabase,
      farmId: ctx.farmId,
      operation: "refresh_token",
      endpoint: "/oauth2/v1/tokens/bearer",
      error,
    });
    await releaseRefreshLock(ctx.supabase, ctx.farmId, lockToken);
    throw error;
  }
}

export async function loadQuickBooksEmployees(requestedFarmId?: string | null) {
  const ctx = await getValidQuickBooksAccessToken(requestedFarmId);
  const query = encodeURIComponent(
    "select Id, DisplayName, Active from Employee where Active = true"
  );
  try {
    const response = await qboRequest<{
      QueryResponse?: {
        Employee?: Array<{ Id: string; DisplayName: string; Active?: boolean }>;
      };
    }>(ctx.connection.realm_id, ctx.accessToken, `/query?query=${query}`);

    await ctx.supabase
      .from("quickbooks_connections")
      .update({
        last_intuit_tid: response.intuitTid,
        last_api_at: new Date().toISOString(),
      })
      .eq("farm_id", ctx.farmId);

    return response.data.QueryResponse?.Employee ?? [];
  } catch (error) {
    await markReconnectRequired(ctx.supabase, ctx.farmId, error);
    await logQuickBooksError({
      supabase: ctx.supabase,
      farmId: ctx.farmId,
      operation: "list_employees",
      endpoint: "/query",
      error,
    });
    throw error;
  }
}
