"use client";

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/client";
import { type FarmContext } from "@/src/lib/farm-cloud";
import {
  loadH2aFarmChoices,
  pickH2aFarm,
  selectH2aFarm,
  type H2aFarmChoice,
} from "@/src/lib/h2a-farm-context";
import { collectPages } from "@/src/lib/pagination";
import { weeklyHours } from "@/src/lib/h2a-hours";
import H2aWeeklyHours from "@/src/components/h2a-weekly-hours";
import SmartPhotoEvidence from "@/src/components/smart-photo-evidence";

type Contract = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  expected_hours_per_day: number | null;
  expected_days_per_week: number | null;
  hourly_wage: number | null;
};
type Worker = {
  id: string;
  employee_number: string;
  legal_name: string;
  preferred_name: string | null;
  contract_id: string | null;
};
type Daily = {
  shift_minutes: number | null;
  paid_break_minutes: number | null;
  break_minutes: number;
  approved_at: string | null;
  worker_id: string;
  contract_id: string | null;
  work_date: string;
  hours_offered: number;
  hours_worked: number;
  piece_quantity: number | null;
};
type Pay = {
  id: string;
  worker_id: string;
  period_start: string;
  period_end: string;
  hours_offered: number;
  hours_worked: number;
  hourly_rate: number | null;
  piece_earnings: number;
  gross_earnings: number;
  deductions: number;
  reimbursements: number;
  net_amount: number | null;
  reviewed_at: string | null;
};

function daysInclusive(a: string, b: string) {
  const x = new Date(a + "T00:00:00Z"),
    y = new Date(b + "T00:00:00Z");
  return Math.max(0, Math.floor((y.getTime() - x.getTime()) / 86400000) + 1);
}
function csvEscape(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function download(name: string, rows: unknown[][]) {
  const b = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], {
    type: "text/csv",
  });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
}

export default function H2APayrollPage() {
  const [supabase] = useState(() => createClient());
  const loadGeneration = useRef(0);
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<FarmContext | null>(null);
  const [farmChoices, setFarmChoices] = useState<H2aFarmChoice[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [pay, setPay] = useState<Pay[]>([]);
  const [message, setMessage] = useState("Loading payroll records...");
  const [wage, setWage] = useState({
    contractId: "",
    effective: new Date().toISOString().slice(0, 10),
    rate: "",
    source: "",
  });
  const [form, setForm] = useState({
    workerId: "",
    contractId: "",
    start: "",
    end: "",
    payday: "",
    rate: "",
    pieceEarnings: "0",
    deductions: "0",
    reimbursements: "0",
  });

  async function load(preferredFarmId?: string) {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setContracts([]);
    setWorkers([]);
    setDaily([]);
    setPay([]);
    setForm((f) => ({ ...f, workerId: "", contractId: "" }));
    try {
      const choices = await loadH2aFarmChoices(supabase);
      if (generation !== loadGeneration.current) return;
      setFarmChoices(choices);
      const farm = preferredFarmId
        ? (choices.find((c) => c.farmId === preferredFarmId) ?? null)
        : pickH2aFarm(choices);
      if (!choices.length) {
        setMessage("Sign in first.");
        return;
      }
      if (!farm) {
        setCtx(null);
        setMessage(
          "Choose the farm whose H-2A payroll records you want to manage.",
        );
        return;
      }
      selectH2aFarm(farm.farmId);
      setCtx(farm);
      const [c, w, d, p] = await Promise.all([
        collectPages((from, to) =>
          supabase
            .from("h2a_contracts")
            .select(
              "id,name,start_date,end_date,expected_hours_per_day,expected_days_per_week,hourly_wage",
            )
            .eq("farm_id", farm.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data, error: null })),
        collectPages((from, to) =>
          supabase
            .from("h2a_workers")
            .select("id,employee_number,legal_name,preferred_name,contract_id")
            .eq("farm_id", farm.farmId)
            .order("employee_number")
            .order("id")
            .range(from, to),
        ).then((data) => ({ data, error: null })),
        collectPages((from, to) =>
          supabase
            .from("h2a_daily_records")
            .select(
              "worker_id,contract_id,work_date,hours_offered,hours_worked,piece_quantity,shift_minutes,paid_break_minutes,break_minutes,approved_at",
            )
            .eq("farm_id", farm.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data, error: null })),
        collectPages((from, to) =>
          supabase
            .from("h2a_pay_statements")
            .select(
              "id,worker_id,period_start,period_end,hours_offered,hours_worked,hourly_rate,piece_earnings,gross_earnings,deductions,reimbursements,net_amount,reviewed_at",
            )
            .eq("farm_id", farm.farmId)
            .order("period_end", { ascending: false })
            .order("id")
            .range(from, to),
        ).then((data) => ({ data, error: null })),
      ]);
      if (generation !== loadGeneration.current) return;
      for (const r of [c, w, d, p]) if (r.error) throw r.error;
      setContracts((c.data ?? []) as Contract[]);
      setWorkers((w.data ?? []) as Worker[]);
      setDaily((d.data ?? []) as Daily[]);
      setPay((p.data ?? []) as Pay[]);
      setMessage("");
    } catch (e) {
      if (generation === loadGeneration.current)
        setMessage(
          e instanceof Error ? e.message : "Unable to load payroll records.",
        );
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current++;
    };
  }, [supabase]);

  const workerName = useMemo(
    () => new Map(workers.map((w) => [w.id, w.preferred_name || w.legal_name])),
    [workers],
  );

  async function saveWage(e: FormEvent) {
    e.preventDefault();
    if (!ctx || loading) return;
    const { error } = await supabase.from("h2a_wage_rates").insert({
      farm_id: ctx.farmId,
      contract_id: wage.contractId || null,
      effective_date: wage.effective,
      hourly_rate: Number(wage.rate),
      source: wage.source || null,
      verified_by: ctx.userId,
      verified_at: new Date().toISOString(),
      created_by: ctx.userId,
    });
    setMessage(error ? error.message : "Wage-rate record saved.");
  }

  async function savePay(e: FormEvent) {
    e.preventDefault();
    if (!ctx || loading) return;
    if (!form.start || !form.end || form.end < form.start)
      return setMessage("Choose a valid pay period.");
    const contractId = workers.find((w) => w.id === form.workerId)?.contract_id;
    const rows = daily.filter(
      (r) =>
        r.worker_id === form.workerId &&
        r.contract_id === contractId &&
        r.work_date >= form.start &&
        r.work_date <= form.end,
    );
    const hoursOffered = rows.reduce(
      (s, r) => s + Number(r.hours_offered || 0),
      0,
    );
    const hoursWorked =
      Math.round(
        (weeklyHours(rows).reduce((sum, week) => sum + week.minutes, 0) / 60) *
          100,
      ) / 100;
    const rate = Number(form.rate) || 0;
    const piece = Number(form.pieceEarnings) || 0;
    const gross = hoursWorked * rate + piece;
    const ded = Number(form.deductions) || 0,
      reimb = Number(form.reimbursements) || 0;
    const net = gross - ded + reimb;
    const { error } = await supabase.from("h2a_pay_statements").insert({
      farm_id: ctx.farmId,
      worker_id: form.workerId,
      contract_id:
        form.contractId ||
        workers.find((w) => w.id === form.workerId)?.contract_id ||
        null,
      period_start: form.start,
      period_end: form.end,
      payday: form.payday || null,
      hours_offered: hoursOffered,
      hours_worked: hoursWorked,
      hourly_rate: rate || null,
      piece_units: rows.reduce((s, r) => s + Number(r.piece_quantity || 0), 0),
      piece_earnings: piece,
      gross_earnings: gross,
      deductions: ded,
      reimbursements: reimb,
      net_amount: net,
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      created_by: ctx.userId,
    });
    setMessage(
      error
        ? error.message
        : "Pay-period worksheet saved. Verify against payroll and the job order before use.",
    );
    if (!error) void load();
  }

  function exportPay() {
    download("farmvoice-h2a-pay-statements.csv", [
      [
        "worker",
        "period_start",
        "period_end",
        "hours_offered",
        "hours_worked",
        "hourly_rate",
        "piece_earnings",
        "gross",
        "deductions",
        "reimbursements",
        "net",
        "reviewed",
      ],
      ...pay.map((p) => [
        workerName.get(p.worker_id) ?? p.worker_id,
        p.period_start,
        p.period_end,
        p.hours_offered,
        p.hours_worked,
        p.hourly_rate,
        p.piece_earnings,
        p.gross_earnings,
        p.deductions,
        p.reimbursements,
        p.net_amount,
        p.reviewed_at,
      ]),
    ]);
  }

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">H-2A payroll preparation</div>
        <h1 style={{ fontSize: "clamp(36px,6vw,60px)" }}>
          Wages, statements & guarantee review
        </h1>
        <p className="lede">
          Prepare payroll records from crew-leader time without requiring worker
          phones. All calculations require employer review.
        </p>
        <p>
          <Link className="btn secondary" href="/h2a">
            Back to H-2A dashboard
          </Link>
        </p>
      </div>
      {message && <div className="notice">{message}</div>}
      {farmChoices.length > 1 && (
        <section className="card form">
          <div className="field">
            <label>Farm</label>
            <select
              value={ctx?.farmId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  loadGeneration.current++;
                  setLoading(false);
                  setCtx(null);
                  setContracts([]);
                  setWorkers([]);
                  setDaily([]);
                  setPay([]);
                  setMessage(
                    "Choose the farm whose H-2A payroll records you want to manage.",
                  );
                  return;
                }
                selectH2aFarm(id);
                void load(id);
              }}
            >
              <option value="">Choose a farm</option>
              {farmChoices.map((f) => (
                <option key={f.farmId} value={f.farmId}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}
      <section className="card stack">
        <div>
          <div className="kicker">Three-fourths planning review</div>
          <h2>Worker progress</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Contract scheduled hours</th>
                <th>75% reference</th>
                <th>Hours offered recorded</th>
                <th>Hours worked</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const c = contracts.find((x) => x.id === w.contract_id);
                const total =
                  c?.expected_hours_per_day && c?.expected_days_per_week
                    ? (daysInclusive(c.start_date, c.end_date) / 7) *
                      Number(c.expected_hours_per_day) *
                      Number(c.expected_days_per_week)
                    : 0;
                const rows = daily.filter(
                  (r) =>
                    r.worker_id === w.id &&
                    r.contract_id === w.contract_id &&
                    (!c ||
                      (r.work_date >= c.start_date &&
                        r.work_date <= c.end_date)),
                );
                const offered = rows.reduce(
                    (s, r) => s + Number(r.hours_offered || 0),
                    0,
                  ),
                  worked = rows.reduce(
                    (s, r) => s + Number(r.hours_worked || 0),
                    0,
                  );
                return (
                  <tr key={w.id}>
                    <td>
                      {w.employee_number} · {w.preferred_name || w.legal_name}
                    </td>
                    <td>{total ? total.toFixed(1) : "—"}</td>
                    <td>{total ? (total * 0.75).toFixed(1) : "—"}</td>
                    <td>{offered.toFixed(1)}</td>
                    <td>{worked.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          This is a planning reference based on configured contract dates/hours,
          not a legal determination of the H-2A three-fourths guarantee. Review
          the certified job order and applicable rules.
        </p>
      </section>
      <section className="grid-2">
        <form className="card form" onSubmit={saveWage}>
          <div>
            <div className="kicker">Wage history</div>
            <h2>Record verified wage rate</h2>
          </div>
          <div className="field">
            <label>Contract</label>
            <select
              value={wage.contractId}
              onChange={(e) => setWage({ ...wage, contractId: e.target.value })}
            >
              <option value="">Select</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <div className="field">
              <label>Effective date</label>
              <input
                type="date"
                value={wage.effective}
                onChange={(e) =>
                  setWage({ ...wage, effective: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Hourly rate</label>
              <input
                required
                inputMode="decimal"
                value={wage.rate}
                onChange={(e) => setWage({ ...wage, rate: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Source / verification note</label>
            <input
              value={wage.source}
              onChange={(e) => setWage({ ...wage, source: e.target.value })}
            />
          </div>
          <button className="btn">Save verified rate</button>
        </form>
        <form className="card form" onSubmit={savePay}>
          <div>
            <div className="kicker">Pay statement worksheet</div>
            <h2>Prepare pay period</h2>
          </div>
          <div className="field">
            <label>Worker</label>
            <select
              required
              value={form.workerId}
              onChange={(e) => setForm({ ...form, workerId: e.target.value })}
            >
              <option value="">Select</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.employee_number} · {w.legal_name}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <div className="field">
              <label>Period start</label>
              <input
                type="date"
                required
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Period end</label>
              <input
                type="date"
                required
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Hourly rate</label>
              <input
                inputMode="decimal"
                required
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Payday</label>
              <input
                type="date"
                value={form.payday}
                onChange={(e) => setForm({ ...form, payday: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Piece earnings</label>
              <input
                value={form.pieceEarnings}
                onChange={(e) =>
                  setForm({ ...form, pieceEarnings: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Deductions</label>
              <input
                value={form.deductions}
                onChange={(e) =>
                  setForm({ ...form, deductions: e.target.value })
                }
              />
            </div>
          </div>
          <div className="field">
            <label>Reimbursements</label>
            <input
              value={form.reimbursements}
              onChange={(e) =>
                setForm({ ...form, reimbursements: e.target.value })
              }
            />
          </div>
          <H2aWeeklyHours
            rows={daily.filter(
              (r) =>
                r.worker_id === form.workerId &&
                r.contract_id ===
                  workers.find((w) => w.id === form.workerId)?.contract_id &&
                r.work_date >= form.start &&
                r.work_date <= form.end,
            )}
            names={workerName}
          />
          <p className="small">
            Worksheet hours come from daily paid hours. Breaks are not deducted
            again. Review pending days before saving.
          </p>
          <button className="btn">Save reviewed worksheet</button>
        </form>
      </section>
      <section className="card">
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <h2>Pay-period history</h2>
          <button className="btn secondary" onClick={exportPay}>
            Download CSV
          </button>
        </div>
        {pay.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Period</th>
                  <th>Hours</th>
                  <th>Gross</th>
                  <th>Net</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {pay.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {workerName.get(p.worker_id) ?? p.worker_id.slice(0, 8)}
                    </td>
                    <td>
                      {p.period_start} – {p.period_end}
                    </td>
                    <td>{p.hours_worked}</td>
                    <td>
                      {"$"}
                      {Number(p.gross_earnings).toFixed(2)}
                    </td>
                    <td>
                      {"$"}
                      {Number(p.net_amount ?? 0).toFixed(2)}
                    </td>
                    <td>
                      {p.reviewed_at ? "Yes" : "No"}
                      {ctx && (
                        <SmartPhotoEvidence
                          farmId={ctx.farmId}
                          userId={ctx.userId}
                          module="h2a"
                          recordType="pay_statement"
                          recordId={p.id}
                          category="pay_evidence"
                          metadata={{
                            worker_id: p.worker_id,
                            period_start: p.period_start,
                            period_end: p.period_end,
                          }}
                          onMessage={setMessage}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No pay statements yet.</p>
        )}
      </section>
      <div className="notice">
        <strong>Review required:</strong> FarmVoice prepares payroll and
        guarantee records but does not determine the legally required wage,
        deductions, reimbursements, or H-2A compliance.
      </div>
    </main>
  );
}
