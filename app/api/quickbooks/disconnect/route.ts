import { NextResponse } from "next/server";
import { requireFarmOwner } from "@/src/lib/quickbooks-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { supabase, farmId } = await requireFarmOwner(typeof body.farmId === "string" ? body.farmId : null);

    const { error: mappingError } = await supabase
      .from("quickbooks_employee_mappings")
      .delete()
      .eq("farm_id", farmId);
    if (mappingError) throw mappingError;

    const { error: connectionError } = await supabase
      .from("quickbooks_connections")
      .delete()
      .eq("farm_id", farmId);
    if (connectionError) throw connectionError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to disconnect QuickBooks." },
      { status: 400 }
    );
  }
}
