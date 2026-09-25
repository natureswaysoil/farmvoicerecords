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

function localDate(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function POST() {
  try {
    const ctx = await getValidQuickBooksAccessToken();

    const [mappingsResult, farmResult] = await Promise.all([
      ctx.supabase
        .from("quickbooks_employee_mappings")
        .select("worker_user_id, quickbooks_employee_id")
        .eq("farm_id", ctx.farmId),
      ctx.supabase.from("farms").select("timezone").eq("id", ctx.farmId).single(),
    ]);
    if (mappingsResult.error) throw mappingsResult.error;
    if (farmResult.error) throw farmResult.error;

    const map = new Map(
      (mappingsResult.data ?? []).map((m) => [m.worker_user_id, m.quickbooks_employee_id])
    );
    const timezone = farmResult.data.timezone ?? "UTC";

    const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();

    const { error: staleNullError } = await ctx.supabase
      .from("time_entries")
      .update({
        qbo_sync_status: "error",
        qbo_sync_error: "Previous QuickBooks sync was interrupted and was reclaimed.",
        qbo_sync_started_at: null,
      })
      .eq("farm_id", ctx.farmId)
      .eq("qbo_sync_status", "syncing")
      .is("qbo_sync_started_at", null);
    if (staleNullError) throw staleNullError;

    const { error: staleTimedError } = await ctx.supabase
      .from("time_entries")
      .update({
        qbo_sync_status: "error",
        qbo_sync_error: "Previous QuickBooks sync lease expired and was reclaimed.",
        qbo_sync_started_at: null,
      })
      .eq("farm_id", ctx.farmId)
      .eq("qbo_sync_status", "syncing")
      .lt("qbo_sync_started_at", staleBefore);
    if (staleTimedError) throw staleTimedError;

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

      const { data: claimed, error: claimError } = await ctx.supabase
        .from("time_entries")
        .update({
          qbo_sync_status: "syncing",
          qbo_sync_error: null,
          qbo_sync_started_at: new Date().toISOString(),
        })
        .eq("id", entry.id)
        .eq("farm_id", ctx.farmId)
        .eq("qbo_sync_status", entry.qbo_sync_status)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) {
        skipped.push({ id: entry.id, reason: "Already claimed by another sync request." });
        continue;
      }

      try {
        const { hours, minutes } = durationParts(entry.clock_in, entry.clock_out!);
        const txnDate = localDate(entry.clock_in, timezone);
        const description = [entry.job, entry.field_name].filter(Boolean).join(" - ").slice(0, 4000);

        const response = await qboRequest<{ TimeActivity?: { Id?: string } }>(
          ctx.connection.realm_id,
          ctx.accessToken,
          `/timeactivity?requestid=${encodeURIComponent(entry.id)}`,
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

        const qboId = response.TimeActivity?.Id;
        if (!qboId) throw new Error("QuickBooks did not return a TimeActivity ID.");

        const { error: updateError } = await ctx.supabase
          .from("time_entries")
          .update({
            qbo_sync_status: "synced",
            qbo_time_activity_id: qboId,
            qbo_realm_id: ctx.connection.realm_id,
            qbo_synced_at: new Date().toISOString(),
            qbo_sync_started_at: null,
            qbo_sync_error: null,
          })
          .eq("id", entry.id)
          .eq("farm_id", ctx.farmId)
          .eq("qbo_sync_status", "syncing");
        if (updateError) throw updateError;
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "QuickBooks sync failed.";
        const { error: saveError } = await ctx.supabase
          .from("time_entries")
          .update({ qbo_sync_status: "error", qbo_sync_error: message, qbo_sync_started_at: null })
          .eq("id", entry.id)
          .eq("farm_id", ctx.farmId)
          .eq("qbo_sync_status", "syncing");
        if (saveError) {
          failed.push({ id: entry.id, error: `${message}; also failed to save sync error: ${saveError.message}` });
        } else {
          failed.push({ id: entry.id, error: message });
        }
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
