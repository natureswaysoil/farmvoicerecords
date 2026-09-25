import { NextRequest, NextResponse } from "next/server";
import {
  encryptSecret,
  exchangeAuthorizationCode,
  qboRequest,
  tokenExpiry,
} from "@/src/lib/quickbooks";
import { logQuickBooksError, requireFarmOwner } from "@/src/lib/quickbooks-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const destination = new URL("/integrations/quickbooks", request.url);
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const realmId = request.nextUrl.searchParams.get("realmId");
    const rawCookie = request.cookies.get("farmvoice_qbo_oauth")?.value;
    if (!code || !state || !realmId || !rawCookie) throw new Error("Incomplete QuickBooks callback.");

    const saved = JSON.parse(Buffer.from(rawCookie, "base64url").toString("utf8")) as {
      state: string;
      farmId: string;
    };
    if (saved.state !== state) throw new Error("QuickBooks authorization state did not match.");

    const { supabase, user, farmId } = await requireFarmOwner();
    if (farmId !== saved.farmId) throw new Error("Farm authorization changed during QuickBooks connection.");

    const { data: existingConnection, error: existingError } = await supabase
      .from("quickbooks_connections")
      .select("realm_id")
      .eq("farm_id", farmId)
      .maybeSingle();
    if (existingError) throw existingError;

    const tokens = await exchangeAuthorizationCode(code);
    const company = await qboRequest<{ CompanyInfo?: { CompanyName?: string } }>(
      realmId,
      tokens.data.access_token,
      "/companyinfo/" + encodeURIComponent(realmId)
    );

    const row = {
      farm_id: farmId,
      realm_id: realmId,
      company_name: company.data.CompanyInfo?.CompanyName ?? null,
      access_token_ciphertext: encryptSecret(tokens.data.access_token),
      refresh_token_ciphertext: encryptSecret(tokens.data.refresh_token),
      access_token_expires_at: tokenExpiry(tokens.data.expires_in),
      refresh_token_expires_at: tokens.data.x_refresh_token_expires_in
        ? tokenExpiry(tokens.data.x_refresh_token_expires_in)
        : null,
      connected_by: user.id,
      refresh_lock_token: null,
      refresh_lock_expires_at: null,
      reconnect_required: false,
      last_auth_error: null,
      last_auth_error_at: null,
      last_intuit_tid: company.intuitTid ?? tokens.intuitTid,
      last_api_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingConnection && existingConnection.realm_id !== realmId) {
      const { error: mappingError } = await supabase
        .from("quickbooks_employee_mappings")
        .delete()
        .eq("farm_id", farmId);
      if (mappingError) throw mappingError;
    }

    const { error } = await supabase.from("quickbooks_connections").upsert(row, {
      onConflict: "farm_id",
    });
    if (error) throw error;

    destination.searchParams.set("connected", "1");
    const response = NextResponse.redirect(destination);
    response.cookies.delete("farmvoice_qbo_oauth");
    return response;
  } catch (error) {
    try {
      const ctx = await requireFarmOwner();
      await logQuickBooksError({
        supabase: ctx.supabase,
        farmId: ctx.farmId,
        operation: "oauth_callback",
        endpoint: "/api/quickbooks/callback",
        error,
      });
    } catch {
      // The callback can fail before an authenticated farm context is available.
    }

    destination.searchParams.set(
      "error",
      error instanceof Error ? error.message : "QuickBooks connection failed."
    );
    return NextResponse.redirect(destination);
  }
}
