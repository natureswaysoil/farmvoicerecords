import { NextResponse } from "next/server";
import { johnDeereConfigured } from "@/src/lib/john-deere";
import { getJohnDeereConnection } from "@/src/lib/john-deere-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const farmId = new URL(request.url).searchParams.get("farmId");
    if (!johnDeereConfigured()) {
      return NextResponse.json({
        configured: false,
        connected: false,
        status: "not_configured",
        organizations: [],
      });
    }

    const ctx = await getJohnDeereConnection(farmId);
    const connection = ctx.connection;
    return NextResponse.json({
      configured: true,
      connected: Boolean(connection),
      status: connection?.status ?? "not_connected",
      organizations: connection?.organizations ?? [],
      selectedOrgId: connection?.selected_org_id ?? null,
      selectedOrgName: connection?.selected_org_name ?? null,
      connectionsUrl: connection?.connections_url ?? null,
      lastSyncAt: connection?.last_sync_at ?? null,
      lastError: connection?.last_error ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load John Deere status.",
      },
      { status: 400 },
    );
  }
}
