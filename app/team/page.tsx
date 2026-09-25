"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getFarmContext, type FarmContext } from "@/src/lib/farm-cloud";

type Member = {
  user_id: string;
  role: "owner" | "worker";
  employee_number: string | null;
};

type Shift = {
  id: string;
  worker_user_id: string;
  job: string;
  field_name: string | null;
  starts_at: string;
  ends_at: string;
};

type TimeEntry = {
  id: string;
  worker_user_id: string;
  job: string | null;
  field_name: string | null;
  clock_in: string;
  clock_out: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_accuracy_m: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  clock_out_accuracy_m: number | null;
  approval_status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
};

type Gps = { lat: number | null; lng: number | null; accuracy: number | null };

const blankShift = { workerUserId: "", job: "Field work", fieldName: "", start: "", end: "" };

export default function TeamPage() {
  const [supabase] = useState(() => createClient());
  const [ctx, setCtx] = useState<FarmContext | null>(null);
  const [farmName, setFarmName] = useState("Farm");
  const [joinCode, setJoinCode] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [times, setTimes] = useState<TimeEntry[]>([]);
  const [shift, setShift] = useState(blankShift);
  const [workJob, setWorkJob] = useState("Field work");
  const [workField, setWorkField] = useState("");
  const [message, setMessage] = useState("Loading farm team...");

  const workerMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m.employee_number ?? m.user_id.slice(0, 8)])),
    [members]
  );

  const currentMember = members.find((m) => m.user_id === ctx?.userId);
  const active = times.find((t) => t.worker_user_id === ctx?.userId && !t.clock_out);

  async function load() {
    const farm = await getFarmContext(supabase);
    if (!farm) {
      setMessage("Sign in and join a farm before using team time.");
      return;
    }
    setCtx(farm);

    const [{ data: farmRow, error: farmError }, { data: memberRows, error: memberError }, { data: shiftRows, error: shiftError }, { data: timeRows, error: timeError }] =
      await Promise.all([
        supabase.from("farms").select("name, join_code").eq("id", farm.farmId).single(),
        supabase.from("farm_members").select("user_id, role, employee_number").eq("farm_id", farm.farmId).order("employee_number"),
        supabase.from("shifts").select("id, worker_user_id, job, field_name, starts_at, ends_at").eq("farm_id", farm.farmId).order("starts_at"),
        supabase.from("time_entries").select("id, worker_user_id, job, field_name, clock_in, clock_out, clock_in_lat, clock_in_lng, clock_in_accuracy_m, clock_out_lat, clock_out_lng, clock_out_accuracy_m, approval_status, reviewed_at").eq("farm_id", farm.farmId).order("clock_in", { ascending: false }).limit(100),
      ]);

    if (farmError) throw farmError;
    if (memberError) throw memberError;
    if (shiftError) throw shiftError;
    if (timeError) throw timeError;

    setFarmName(farmRow.name);
    setJoinCode(farmRow.join_code);
    setMembers((memberRows ?? []) as Member[]);
    setShifts((shiftRows ?? []) as Shift[]);
    setTimes((timeRows ?? []) as TimeEntry[]);
    setShift((s) => ({
      ...s,
      workerUserId: s.workerUserId || memberRows?.find((m) => m.role === "worker")?.user_id || "",
    }));
    setMessage("");
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load team data."));
  }, []);

  function captureGps(): Promise<Gps> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null, accuracy: null });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => resolve({ lat: null, lng: null, accuracy: null }),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }

  async function addShift() {
    if (!ctx || ctx.role !== "owner") return setMessage("Owner access is required to schedule.");
    if (!shift.workerUserId || !shift.start || !shift.end) return setMessage("Choose a worker and enter start/end times.");
    const { error } = await supabase.from("shifts").insert({
      farm_id: ctx.farmId,
      worker_user_id: shift.workerUserId,
      created_by: ctx.userId,
      job: shift.job.trim() || "Field work",
      field_name: shift.fieldName.trim() || null,
      starts_at: new Date(shift.start).toISOString(),
      ends_at: new Date(shift.end).toISOString(),
    });
    if (error) return setMessage(error.message);
    setMessage("Shift scheduled.");
    setShift((s) => ({ ...blankShift, workerUserId: s.workerUserId }));
    await load();
  }

  async function clockIn() {
    if (!ctx || currentMember?.role !== "worker") return setMessage("Worker access is required to clock in.");
    if (active) return setMessage("You already have an active time entry.");
    const gps = await captureGps();
    const now = new Date().toISOString();
    const { error } = await supabase.from("time_entries").insert({
      farm_id: ctx.farmId,
      worker_user_id: ctx.userId,
      job: workJob.trim() || "Field work",
      field_name: workField.trim() || null,
      clock_in: now,
      clock_in_lat: gps.lat,
      clock_in_lng: gps.lng,
      clock_in_accuracy_m: gps.accuracy,
      approval_status: "pending",
    });
    if (error) return setMessage(error.message);
    setMessage("Clocked in and saved.");
    await load();
  }

  async function clockOut() {
    if (!ctx || !active) return;
    const gps = await captureGps();
    const { error } = await supabase
      .from("time_entries")
      .update({
        clock_out: new Date().toISOString(),
        clock_out_lat: gps.lat,
        clock_out_lng: gps.lng,
        clock_out_accuracy_m: gps.accuracy,
      })
      .eq("id", active.id)
      .eq("worker_user_id", ctx.userId);
    if (error) return setMessage(error.message);
    setMessage("Clocked out and saved.");
    await load();
  }

  async function review(id: string, status: "approved" | "rejected") {
    if (!ctx || ctx.role !== "owner") return;
    const { error } = await supabase
      .from("time_entries")
      .update({
        approval_status: status,
        reviewed_by: ctx.userId,
        reviewed_at: new Date().toISOString(),
        qbo_sync_status: status === "approved" ? "not_synced" : "not_synced",
        qbo_sync_error: null,
      })
      .eq("id", id)
      .eq("farm_id", ctx.farmId);
    if (error) return setMessage(error.message);
    setMessage(status === "approved" ? "Time approved." : "Time rejected.");
    await load();
  }

  function csv() {
    const rows = times.filter((t) => t.approval_status === "approved" && t.clock_out);
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const header = ["worker", "job", "field", "clock_in_utc", "clock_out_utc", "gps_in", "gps_out"];
    const text = [
      header.join(","),
      ...rows.map((t) =>
        [
          workerMap.get(t.worker_user_id),
          t.job,
          t.field_name,
          t.clock_in,
          t.clock_out,
          t.clock_in_lat == null ? "" : `${t.clock_in_lat},${t.clock_in_lng}`,
          t.clock_out_lat == null ? "" : `${t.clock_out_lat},${t.clock_out_lng}`,
        ].map(esc).join(",")
      ),
    ].join("\n");
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "approved-time.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">Team, schedule & time</div>
        <h2>{farmName}</h2>
        <p className="muted">GPS is captured only at clock-in and clock-out. Time and approvals are stored in the farm database.</p>
      </div>

      <div className="grid-2">
        <section className="card stack">
          <h3>Worker join code</h3>
          <div className="stat">{joinCode || "—"}</div>
          <p className="muted">Use the complete farm code. Employee IDs and farm join codes are different.</p>
          <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(joinCode)} disabled={!joinCode}>Copy code</button>
        </section>

        <section className="card stack">
          <h3>Employee time clock</h3>
          {currentMember?.role === "worker" ? (
            <>
              <div className="field"><label>Job</label><input value={workJob} onChange={(e) => setWorkJob(e.target.value)} disabled={Boolean(active)} /></div>
              <div className="field"><label>Field</label><input value={workField} onChange={(e) => setWorkField(e.target.value)} disabled={Boolean(active)} /></div>
              <div className="inline">
                <button className="btn" disabled={Boolean(active)} onClick={clockIn}>Clock in with GPS</button>
                <button className="btn secondary" disabled={!active} onClick={clockOut}>Clock out with GPS</button>
              </div>
            </>
          ) : (
            <p className="muted">Owners review time here. Worker accounts use this panel to clock in and out.</p>
          )}
        </section>
      </div>

      {ctx?.role === "owner" && (
        <section className="card form">
          <h3>Weekly scheduling</h3>
          <div className="row">
            <div className="field">
              <label>Worker</label>
              <select value={shift.workerUserId} onChange={(e) => setShift({ ...shift, workerUserId: e.target.value })}>
                <option value="">Choose worker</option>
                {members.filter((m) => m.role === "worker").map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.employee_number ?? m.user_id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            <div className="field"><label>Job</label><input value={shift.job} onChange={(e) => setShift({ ...shift, job: e.target.value })} /></div>
          </div>
          <div className="field"><label>Field</label><input value={shift.fieldName} onChange={(e) => setShift({ ...shift, fieldName: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label>Start</label><input type="datetime-local" value={shift.start} onChange={(e) => setShift({ ...shift, start: e.target.value })} /></div>
            <div className="field"><label>End</label><input type="datetime-local" value={shift.end} onChange={(e) => setShift({ ...shift, end: e.target.value })} /></div>
          </div>
          <button className="btn" onClick={addShift}>Schedule shift</button>
          {shifts.length > 0 && (
            <table className="table">
              <thead><tr><th>Worker</th><th>Job / Field</th><th>Start</th><th>End</th></tr></thead>
              <tbody>{shifts.map((s) => <tr key={s.id}><td>{workerMap.get(s.worker_user_id)}</td><td>{s.job}{s.field_name ? ` · ${s.field_name}` : ""}</td><td>{new Date(s.starts_at).toLocaleString()}</td><td>{new Date(s.ends_at).toLocaleString()}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      )}

      <section className="card stack">
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <h3>{ctx?.role === "owner" ? "Manager review" : "My time entries"}</h3>
          {ctx?.role === "owner" && <button className="btn secondary" onClick={csv}>Download approved-time CSV</button>}
        </div>
        {times.length ? (
          <table className="table">
            <thead><tr><th>Worker</th><th>Job / Field</th><th>Clock in</th><th>Clock out</th><th>Status</th>{ctx?.role === "owner" && <th>Review</th>}</tr></thead>
            <tbody>
              {times.map((t) => (
                <tr key={t.id}>
                  <td>{workerMap.get(t.worker_user_id) ?? t.worker_user_id.slice(0, 8)}</td>
                  <td>{t.job ?? "—"}{t.field_name ? ` · ${t.field_name}` : ""}</td>
                  <td>{new Date(t.clock_in).toLocaleString()}</td>
                  <td>{t.clock_out ? new Date(t.clock_out).toLocaleString() : "Active"}</td>
                  <td>{t.approval_status}</td>
                  {ctx?.role === "owner" && (
                    <td>{t.clock_out ? <span className="inline"><button className="btn secondary" onClick={() => review(t.id, "approved")}>Approve</button><button className="btn secondary" onClick={() => review(t.id, "rejected")}>Reject</button></span> : "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No time entries yet.</p>}
      </section>

      {message && <div className="notice">{message}</div>}
    </main>
  );
}
