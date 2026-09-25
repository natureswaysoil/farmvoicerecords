import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildQuickBooksAuthorizeUrl } from "@/src/lib/quickbooks";
import { requireFarmOwner } from "@/src/lib/quickbooks-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { farmId } = await requireFarmOwner();
    const state = crypto.randomBytes(24).toString("base64url");
    const response = NextResponse.redirect(buildQuickBooksAuthorizeUrl(state));
    response.cookies.set(
      "farmvoice_qbo_oauth",
      Buffer.from(JSON.stringify({ state, farmId })).toString("base64url"),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      }
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start QuickBooks connection." },
      { status: 401 }
    );
  }
}
