import { NextRequest, NextResponse } from "next/server";
import {
  encryptSecret,
  exchangeAuthorizationCode,
  qboRequest,
  tokenExpiry,
} from "@/src/lib/quickbooks";
import { requireFarmOwner } from "@/src/lib/quickbooks-server";

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

    const tokens = await exchangeAuthorizationCode(code);
    const company = await qboRequest<{ CompanyInfo?: { CompanyName?: string } }>(
      realmId,
      tokens.access_token,
      "/companyinfo/" + encodeURIComponent(realmId)
    );

    const row = {
      farm_id: farmId,
      realm_id: realmId,
      company_name: company.CompanyInfo?.CompanyName ?? null,
      access_token_ciphertext: encryptSecret(tokens.access_token),
      refresh_token_ciphertext: encryptSecret(tokens.refresh_token),
      access_token_expires_at: tokenExpiry(tokens.expires_in),
      refresh_token_expires_at: tokens.x_refresh_token_expires_in
        ? tokenExpiry(tokens.x_refresh_token_expires_in)
        : null,
      connected_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("quickbooks_connections").upsert(row, {
      onConflict: "farm_id",
    });
    if (error) throw error;

    destination.searchParams.set("connected", "1");
    const response = NextResponse.redirect(destination);
    response.cookies.delete("farmvoice_qbo_oauth");
    return response;
  } catch (error) {
    destination.searchParams.set(
      "error",
      error instanceof Error ? error.message : "QuickBooks connection failed."
    );
    return NextResponse.redirect(destination);
  }
}
