import { NextResponse } from "next/server";
import { getJohnDeereConnection } from "@/src/lib/john-deere-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const farmId = typeof body.farmId === "string" ? body.farmId : null;
    const ctx = await getJohnDeereConnection(farmId);
    if (ctx.connection) {
      const { error } = await ctx.supabase
        .from("john_deere_connections")
        .delete()
        .eq("farm_id", ctx.farmId);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to disconnect John Deere." },
      { status: 400 },
    );
  }
}
