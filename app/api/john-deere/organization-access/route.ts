import { NextRequest, NextResponse } from "next/server";
import { buildJohnDeereOrganizationAccessUrl } from "@/src/lib/john-deere";
import { requireJohnDeereFarmOwner } from "@/src/lib/john-deere-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const farmId = request.nextUrl.searchParams.get("farmId");
    const ctx = await requireJohnDeereFarmOwner(farmId);
    const response = NextResponse.redirect(buildJohnDeereOrganizationAccessUrl());
    response.cookies.set(
      "farmvoice_jd_org_access",
      Buffer.from(JSON.stringify({ farmId: ctx.farmId }), "utf8").toString("base64url"),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 15 * 60,
      },
    );
    return response;
  } catch (error) {
    const destination = new URL("/integrations/equipment", request.url);
    destination.searchParams.set(
      "johnDeereError",
      error instanceof Error ? error.message : "Unable to open John Deere organization access.",
    );
    return NextResponse.redirect(destination);
  }
}
