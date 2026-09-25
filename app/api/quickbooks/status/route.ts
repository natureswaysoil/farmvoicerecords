import { NextResponse } from "next/server";
import { getQuickBooksConnection, loadQuickBooksEmployees, requireFarmOwner } from "@/src/lib/quickbooks-server";

export const runtime = "nodejs";

function validateTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const ctx = await getQuickBooksConnection();
    const [membersResult, mappingsResult, farmResult] = await Promise.all([
      ctx.supabase
        .from("farm_members")
        .select("user_id, employee_number, role")
        .eq("farm_id", ctx.farmId)
        .order("employee_number"),
      ctx.supabase
        .from("quickbooks_employee_mappings")
        .select("worker_user_id, quickbooks_employee_id, quickbooks_employee_name")
        .eq("farm_id", ctx.farmId),
      ctx.supabase
        .from("farms")
        .select("timezone")
        .eq("id", ctx.farmId)
        .single(),
    ]);

    if (membersResult.error) throw membersResult.error;
    if (mappingsResult.error) throw mappingsResult.error;
    if (farmResult.error) throw farmResult.error;

    let quickBooksEmployees: Array<{ Id: string; DisplayName: string; Active?: boolean }> = [];
    if (ctx.connection) {
      quickBooksEmployees = await loadQuickBooksEmployees();
    }

    return NextResponse.json({
      connected: Boolean(ctx.connection),
      companyName: ctx.connection?.company_name ?? null,
      realmId: ctx.connection?.realm_id ?? null,
      timezone: farmResult.data.timezone ?? "UTC",
      workers: (membersResult.data ?? []).filter((m) => m.role === "worker"),
      mappings: mappingsResult.data ?? [],
      quickBooksEmployees,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load QuickBooks status." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, farmId, user } = await requireFarmOwner();
    const body = await request.json();

    if (typeof body.timezone === "string") {
      const timezone = body.timezone.trim();
      if (!timezone || !validateTimeZone(timezone)) {
        return NextResponse.json({ error: "Enter a valid IANA timezone, such as America/New_York." }, { status: 400 });
      }
      const { error } = await supabase.from("farms").update({ timezone }).eq("id", farmId);
      if (error) throw error;
      return NextResponse.json({ ok: true, timezone });
    }

    const workerUserId = String(body.workerUserId ?? "");
    const quickbooksEmployeeId = String(body.quickbooksEmployeeId ?? "");
    const quickbooksEmployeeName = String(body.quickbooksEmployeeName ?? "");

    if (!workerUserId || !quickbooksEmployeeId) {
      return NextResponse.json({ error: "Worker and QuickBooks employee are required." }, { status: 400 });
    }

    const { data: member, error: memberError } = await supabase
      .from("farm_members")
      .select("user_id, role")
      .eq("farm_id", farmId)
      .eq("user_id", workerUserId)
      .eq("role", "worker")
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) return NextResponse.json({ error: "Worker does not belong to this farm." }, { status: 400 });

    const { error } = await supabase.from("quickbooks_employee_mappings").upsert(
      {
        farm_id: farmId,
        worker_user_id: workerUserId,
        quickbooks_employee_id: quickbooksEmployeeId,
        quickbooks_employee_name: quickbooksEmployeeName || null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "farm_id,worker_user_id" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save QuickBooks settings." },
      { status: 400 }
    );
  }
}
