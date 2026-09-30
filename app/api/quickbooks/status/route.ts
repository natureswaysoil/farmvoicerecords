import { NextResponse } from "next/server";
import {
  getQuickBooksConnection,
  loadQuickBooksEmployees,
  requireFarmOwner,
} from "@/src/lib/quickbooks-server";

export const runtime = "nodejs";

function validateTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const farmIdParam = new URL(request.url).searchParams.get("farmId");
    const ctx = await getQuickBooksConnection(farmIdParam);
    const [
      membersResult,
      mappingsResult,
      farmResult,
      crewWorkers,
      crewMappings,
    ] = await Promise.all([
      ctx.supabase
        .from("farm_members")
        .select("user_id, employee_number, role")
        .eq("farm_id", ctx.farmId)
        .order("employee_number"),
      ctx.supabase
        .from("quickbooks_employee_mappings")
        .select(
          "worker_user_id, quickbooks_employee_id, quickbooks_employee_name",
        )
        .eq("farm_id", ctx.farmId),
      ctx.supabase
        .from("farms")
        .select("timezone")
        .eq("id", ctx.farmId)
        .single(),
      ctx.supabase
        .from("crew_workers")
        .select("id,name,employee_number")
        .eq("farm_id", ctx.farmId),
      ctx.supabase
        .from("quickbooks_crew_mappings")
        .select("worker_id,quickbooks_employee_id,quickbooks_employee_name")
        .eq("farm_id", ctx.farmId),
    ]);

    if (crewWorkers.error) throw crewWorkers.error;
    if (crewMappings.error) throw crewMappings.error;
    if (membersResult.error) throw membersResult.error;
    if (mappingsResult.error) throw mappingsResult.error;
    if (farmResult.error) throw farmResult.error;

    let quickBooksEmployees: Array<{
      Id: string;
      DisplayName: string;
      Active?: boolean;
    }> = [];
    let connection = ctx.connection;

    if (connection && !connection.reconnect_required) {
      try {
        quickBooksEmployees = await loadQuickBooksEmployees(ctx.farmId);
      } catch {
        const { data: refreshedConnection, error: connectionError } =
          await ctx.supabase
            .from("quickbooks_connections")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .maybeSingle();
        if (connectionError) throw connectionError;
        connection = refreshedConnection ?? connection;

        if (!connection.reconnect_required) {
          throw new Error("Unable to load QuickBooks employees.");
        }
      }
    }

    return NextResponse.json({
      farmId: ctx.farmId,
      connected: Boolean(connection),
      companyName: connection?.company_name ?? null,
      realmId: connection?.realm_id ?? null,
      reconnectRequired: Boolean(connection?.reconnect_required),
      lastAuthError: connection?.last_auth_error ?? null,
      lastIntuitTid: connection?.last_intuit_tid ?? null,
      lastApiAt: connection?.last_api_at ?? null,
      timezone: farmResult.data.timezone ?? "UTC",
      workers: [
        ...(membersResult.data ?? []).filter((m) => m.role === "worker"),
        ...(crewWorkers.data ?? []).map((w) => ({
          user_id: `crew:${w.id}`,
          employee_number: `${w.name} (${w.employee_number}) — crew`,
          role: "crew",
        })),
      ],
      mappings: [
        ...(mappingsResult.data ?? []),
        ...(crewMappings.data ?? []).map((m) => ({
          ...m,
          worker_user_id: `crew:${m.worker_id}`,
        })),
      ],
      quickBooksEmployees,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load QuickBooks status.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { supabase, farmId, user } = await requireFarmOwner(
      typeof body.farmId === "string" ? body.farmId : null,
    );

    if (typeof body.timezone === "string") {
      const timezone = body.timezone.trim();
      if (!timezone || !validateTimeZone(timezone)) {
        return NextResponse.json(
          { error: "Enter a valid IANA timezone, such as America/New_York." },
          { status: 400 },
        );
      }
      const { error } = await supabase
        .from("farms")
        .update({ timezone })
        .eq("id", farmId);
      if (error) throw error;
      return NextResponse.json({ ok: true, timezone });
    }

    const workerUserId = String(body.workerUserId ?? "");
    const quickbooksEmployeeId = String(body.quickbooksEmployeeId ?? "");
    const quickbooksEmployeeName = String(body.quickbooksEmployeeName ?? "");

    if (!workerUserId || !quickbooksEmployeeId) {
      return NextResponse.json(
        { error: "Worker and QuickBooks employee are required." },
        { status: 400 },
      );
    }

    const isCrew = workerUserId.startsWith("crew:");
    const workerId = isCrew ? workerUserId.slice(5) : workerUserId;
    let memberQuery = supabase
      .from(isCrew ? "crew_workers" : "farm_members")
      .select("*")
      .eq("farm_id", farmId)
      .eq(isCrew ? "id" : "user_id", workerId);
    if (!isCrew) memberQuery = memberQuery.eq("role", "worker");
    const { data: member, error: memberError } =
      await memberQuery.maybeSingle();
    if (memberError) throw memberError;
    if (!member)
      return NextResponse.json(
        { error: "Worker does not belong to this farm." },
        { status: 400 },
      );

    const { error } = await supabase
      .from(
        isCrew ? "quickbooks_crew_mappings" : "quickbooks_employee_mappings",
      )
      .upsert(
        {
          farm_id: farmId,
          [isCrew ? "worker_id" : "worker_user_id"]: workerId,
          quickbooks_employee_id: quickbooksEmployeeId,
          quickbooks_employee_name: quickbooksEmployeeName || null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: isCrew ? "farm_id,worker_id" : "farm_id,worker_user_id" },
      );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save QuickBooks settings.",
      },
      { status: 400 },
    );
  }
}
