import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildJohnDeereAuthorizeUrl,
  johnDeereConfigured,
} from "@/src/lib/john-deere";
import { requireJohnDeereFarmOwner } from "@/src/lib/john-deere-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!johnDeereConfigured()) {
      return NextResponse.json(
        { error: "John Deere API credentials are not configured yet." },
        { status: 503 },
      );
    }

    const farmIdParam = new URL(request.url).searchParams.get("farmId");
    const { farmId } = await requireJohnDeereFarmOwner(farmIdParam);
    const state = crypto.randomBytes(24).toString("base64url");
    const response = NextResponse.redirect(buildJohnDeereAuthorizeUrl(state));
    response.cookies.set(
      "farmvoice_jd_oauth",
      Buffer.from(JSON.stringify({ state, farmId })).toString("base64url"),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      },
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start John Deere connection.",
      },
      { status: 401 },
    );
  }
}
