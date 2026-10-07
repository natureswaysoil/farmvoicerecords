import { createClient } from "@/src/lib/supabase/server";
import { requireOwnerFarmId } from "@/src/lib/farm-owner-server";
import {
  decryptJohnDeereSecret,
  encryptJohnDeereSecret,
  johnDeereRequest,
  johnDeereTokenExpiry,
  refreshJohnDeereAccessToken,
} from "@/src/lib/john-deere";

export async function requireJohnDeereFarmOwner(
  requestedFarmId?: string | null,
) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in is required.");
  const farmId = await requireOwnerFarmId(
    supabase,
    userData.user.id,
    requestedFarmId,
  );
  return { supabase, user: userData.user, farmId };
}

export async function getJohnDeereConnection(
  requestedFarmId?: string | null,
) {
  const ctx = await requireJohnDeereFarmOwner(requestedFarmId);
  const { data, error } = await ctx.supabase
    .from("john_deere_connections")
    .select("*")
    .eq("farm_id", ctx.farmId)
    .maybeSingle();
  if (error) throw error;
  return { ...ctx, connection: data };
}

export async function getValidJohnDeereAccessToken(
  requestedFarmId?: string | null,
) {
  const ctx = await getJohnDeereConnection(requestedFarmId);
  if (!ctx.connection) throw new Error("John Deere is not connected.");

  const expiresAt = new Date(ctx.connection.access_token_expires_at).getTime();
  if (expiresAt > Date.now() + 90_000) {
    return {
      ...ctx,
      accessToken: decryptJohnDeereSecret(
        ctx.connection.access_token_ciphertext,
      ),
    };
  }

  const lockToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await ctx.supabase.rpc(
    "claim_john_deere_refresh", { p_farm_id: ctx.farmId, p_token: lockToken },
  );
  if (claimError) throw claimError;
  if (!claimed) {
    // Another request owns the refresh; never spend the same rotating token twice.
    throw new Error("John Deere token refresh is in progress. Please retry.");
  }
  try {
    const { data: current, error: readError } = await ctx.supabase
      .from("john_deere_connections").select("*")
      .eq("farm_id", ctx.farmId).eq("refresh_lock_token", lockToken).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("John Deere refresh lock was lost.");
    if (new Date(current.access_token_expires_at).getTime() > Date.now() + 90_000)
      return { ...ctx, connection: current, accessToken: decryptJohnDeereSecret(current.access_token_ciphertext) };
    if (!current.refresh_token_ciphertext)
      throw new Error("John Deere authorization expired. Reconnect John Deere.");
    const refreshed = await refreshJohnDeereAccessToken(
      decryptJohnDeereSecret(current.refresh_token_ciphertext),
    );
    const { data: saved, error } = await ctx.supabase
      .from("john_deere_connections")
      .update({
        access_token_ciphertext: encryptJohnDeereSecret(refreshed.access_token),
        refresh_token_ciphertext: refreshed.refresh_token
          ? encryptJohnDeereSecret(refreshed.refresh_token) : current.refresh_token_ciphertext,
        access_token_expires_at: johnDeereTokenExpiry(refreshed.expires_in),
        scopes: refreshed.scope ? refreshed.scope.split(/\s+/).filter(Boolean) : current.scopes,
        status: "connected", last_error: null, updated_at: new Date().toISOString(),
        refresh_lock_token: null, refresh_lock_expires_at: null,
      })
      .eq("farm_id", ctx.farmId).eq("refresh_lock_token", lockToken)
      .eq("refresh_token_ciphertext", current.refresh_token_ciphertext)
      .select("*").maybeSingle();
    if (error) throw error;
    if (!saved) throw new Error("John Deere connection changed during refresh. Please retry.");
    return { ...ctx, connection: saved, accessToken: refreshed.access_token };
  } finally {
    // Conditional release cannot remove a later request's lease.
    await ctx.supabase.from("john_deere_connections")
      .update({ refresh_lock_token: null, refresh_lock_expires_at: null })
      .eq("farm_id", ctx.farmId).eq("refresh_lock_token", lockToken);
  }
}

export async function refreshJohnDeereOrganizations(
  requestedFarmId?: string | null,
) {
  const ctx = await getValidJohnDeereAccessToken(requestedFarmId);
  const response = await johnDeereRequest<{
    values?: Array<{ id?: string | number; name?: string }>;
    links?: Array<{ rel?: string; uri?: string }>;
  }>(ctx.accessToken, "/organizations");

  const organizations = (response.data.values ?? [])
    .map((org) => ({
      id: String(org.id ?? "").trim(),
      name: String(org.name ?? "").trim(),
    }))
    .filter((org) => org.id);

  const connectionsUrl =
    response.data.links?.find((link) =>
      ["connections", "manage_connections"].includes(link.rel ?? ""),
    )?.uri ?? null;

  let selectedOrgId = ctx.connection.selected_org_id as string | null;
  let selectedOrgName = ctx.connection.selected_org_name as string | null;

  if (
    selectedOrgId &&
    !organizations.some((organization) => organization.id === selectedOrgId)
  ) {
    selectedOrgId = null;
    selectedOrgName = null;
  }
  if (!selectedOrgId && organizations.length === 1) {
    selectedOrgId = organizations[0].id;
    selectedOrgName = organizations[0].name || null;
  }

  const status =
    organizations.length === 0
      ? "needs_organization_access"
      : "connected";

  const { data: saved, error } = await ctx.supabase
    .from("john_deere_connections")
    .update({
      organizations,
      selected_org_id: selectedOrgId,
      selected_org_name: selectedOrgName,
      connections_url: connectionsUrl,
      status,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("farm_id", ctx.farmId)
    .select("*")
    .single();
  if (error) throw error;

  return { ...ctx, connection: saved, organizations, connectionsUrl };
}
