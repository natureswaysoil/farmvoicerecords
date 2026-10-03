import { NextResponse } from "next/server";
import { refreshJohnDeereOrganizations } from "@/src/lib/john-deere-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const farmId = typeof body.farmId === "string" ? body.farmId : null;
    const ctx = await refreshJohnDeereOrganizations(farmId);
    return NextResponse.json({
      ok: true,
      organizations: ctx.organizations,
      connectionsUrl: ctx.connectionsUrl,
      selectedOrgId: ctx.connection.selected_org_id ?? null,
      status: ctx.connection.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to refresh organizations." },
      { status: 400 },
    );
  }
}
