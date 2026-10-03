import { NextRequest, NextResponse } from "next/server";
import {
  encryptJohnDeereSecret,
  exchangeJohnDeereAuthorizationCode,
  johnDeereTokenExpiry,
} from "@/src/lib/john-deere";
import {
  refreshJohnDeereOrganizations,
  requireJohnDeereFarmOwner,
} from "@/src/lib/john-deere-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const destination = new URL("/integrations/equipment", request.url);

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const errorParam = request.nextUrl.searchParams.get("error");
    const rawCookie = request.cookies.get("farmvoice_jd_oauth")?.value;

    if (errorParam) throw new Error(`John Deere authorization: ${errorParam}`);
    if (!code || !state || !rawCookie) {
      throw new Error("Incomplete John Deere callback.");
    }

    const saved = JSON.parse(
      Buffer.from(rawCookie, "base64url").toString("utf8"),
    ) as { state: string; farmId: string };

    if (saved.state !== state) {
      throw new Error("John Deere authorization state did not match.");
    }

    const { supabase, user, farmId } = await requireJohnDeereFarmOwner(
      saved.farmId,
    );
    if (farmId !== saved.farmId) {
      throw new Error("Farm authorization changed during John Deere connection.");
    }

    const tokens = await exchangeJohnDeereAuthorizationCode(code);
    const { error } = await supabase.from("john_deere_connections").upsert(
      {
        farm_id: farmId,
        connected_by: user.id,
        status: "connected",
        access_token_ciphertext: encryptJohnDeereSecret(tokens.access_token),
        refresh_token_ciphertext: tokens.refresh_token
          ? encryptJohnDeereSecret(tokens.refresh_token)
          : null,
        access_token_expires_at: johnDeereTokenExpiry(tokens.expires_in),
        scopes: tokens.scope
          ? tokens.scope.split(/\s+/).filter(Boolean)
          : [],
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "farm_id" },
    );
    if (error) throw error;

    const organizations = await refreshJohnDeereOrganizations(farmId);
    destination.searchParams.set("johnDeere", "connected");
    if (organizations.connection.status === "needs_organization_access") {
      destination.searchParams.set("organizationAccess", "required");
    }

    const response = NextResponse.redirect(destination);
    response.cookies.delete("farmvoice_jd_oauth");
    return response;
  } catch (error) {
    destination.searchParams.set(
      "johnDeereError",
      error instanceof Error ? error.message : "John Deere connection failed.",
    );
    const response = NextResponse.redirect(destination);
    response.cookies.delete("farmvoice_jd_oauth");
    return response;
  }
}
