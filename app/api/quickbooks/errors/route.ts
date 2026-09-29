import { NextResponse } from "next/server";
import { requireFarmOwner } from "@/src/lib/quickbooks-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const farmIdParam = new URL(request.url).searchParams.get("farmId");
    const { supabase, farmId } = await requireFarmOwner(farmIdParam);
    const { data, error } = await supabase
      .from("quickbooks_error_logs")
      .select("id, occurred_at, operation, endpoint, http_status, intuit_tid, error_code, error_message, error_detail, reconnect_required, context")
      .eq("farm_id", farmId)
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ errors: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load QuickBooks error logs." },
      { status: error instanceof Error && error.message === "Sign in is required." ? 401 : 400 }
    );
  }
}
