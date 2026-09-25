import { NextResponse } from "next/server";
import { qboRequest } from "@/src/lib/quickbooks";
import { getValidQuickBooksAccessToken } from "@/src/lib/quickbooks-server";

export const runtime = "nodejs";

function durationParts(clockIn: string, clockOut: string) {
  const minutesTotal = Math.max(
    0,
    Math.round((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000)
  );
  return { hours: Math.floor(minutesTotal / 60), minutes: minutesTotal % 60 };
}

export async function POST() {
  try {
    const ctx = await getValidQuickBooksAccessToken();

    const { data: mappings, error: mapError } = await ctx.supabase
      .from("quickbooks_employee_mappings")
      .select("worker_user_id, quickbooks_employee_id")
      .eq("farm_id", ctx.farmId);
    if (mapError) throw mapError;

    const map = new Map((mappings ?? []).map((m) => [m.worker_user_id, m.quickbooks_employee_id]));

    const { data: entries, error: entryError } = await ctx.supabase
      .from("time_entries")
      .select("id, worker_user_id, job, field_name, clock_in, clock_out, approval_status, qbo_sync_status")
      .eq("farm_id", ctx.farmId)
      .eq("approval_status", "approved")
      .not("clock_out", "is", null)
      .in("qbo_sync_status", ["not_synced", "error"])
      .order("clock_in");
    if (entryError) throw entryError;

    let synced = 0;
    const skipped: Array<{ id: string; reason: string }> = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const entry of entries ?? []) {
      const employeeId = map.get(entry.worker_user_id);
      if (!employeeId) {
        skipped.push({ id: entry.id, reason: "No QuickBooks employee mapping." });
        continue;
      }

      await ctx.supabase
        .from("time_entries")
        .update({ qbo_sync_status: "syncing", qbo_sync_error: null })
        .eq("id", entry.id)
        .eq("farm_id", ctx.farmId);

      try {
        const { hours, minutes } = durationParts(entry.clock_in, entry.clock_out!);
        const txnDate = new Date(entry.clock_in).toISOString().slice(0, 10);
        const description = [entry.job, entry.field_name].filter(Boolean).join(" - ").slice(0, 4000);

        const response = await qboRequest<{ TimeActivity?: { Id?: string } }>(
          ctx.connection.realm_id,
          ctx.accessToken,
          "/timeactivity",
          {
            method: "POST",
            body: JSON.stringify({
              TxnDate: txnDate,
              NameOf: "Employee",
              EmployeeRef: { value: employeeId },
              Hours: hours,
              Minutes: minutes,
              StartTime: entry.clock_in,
              EndTime: entry.clock_out,
              Description: description || "FarmVoice approved time",
            }),
          }
        );

        const qboId = response.TimeActivity?.Id ?? null;
        const { error: updateError } = await ctx.supabase
          .from("time_entries")
          .update({
            qbo_sync_status: "synced",
            qbo_time_activity_id: qboId,
            qbo_synced_at: new Date().toISOString(),
            qbo_sync_error: null,
          })
          .eq("id", entry.id)
          .eq("farm_id", ctx.farmId);
        if (updateError) throw updateError;
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "QuickBooks sync failed.";
        await ctx.supabase
          .from("time_entries")
          .update({ qbo_sync_status: "error", qbo_sync_error: message })
          .eq("id", entry.id)
          .eq("farm_id", ctx.farmId);
        failed.push({ id: entry.id, error: message });
      }
    }

    return NextResponse.json({
      synced,
      skipped,
      failed,
      totalEligible: entries?.length ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "QuickBooks sync failed." },
      { status: 400 }
    );
  }
}
