"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getNamedFarmContexts, rememberFarmSelection, type FarmContext } from "@/src/lib/farm-cloud";

type PromptId =
  | "incomplete_records"
  | "pesticide_field"
  | "crew_hours"
  | "scheduled_vs_actual"
  | "h2a_attention"
  | "field_activity";

type Answer = {
  title: string;
  answer: string;
  note?: string;
  metrics?: Array<{ label: string; value: string }>;
  rows?: Array<{ id: string; type?: string; status?: string; date?: string | null; detail: string }>;
};

const questions: Array<{ id: PromptId; label: string; needsField?: boolean }> = [
  { id: "incomplete_records", label: "What farm records are incomplete?" },
  { id: "pesticide_field", label: "Show pesticide applications for a field.", needsField: true },
  { id: "crew_hours", label: "How many hours did my crew work?" },
  { id: "scheduled_vs_actual", label: "Show scheduled versus actual hours." },
  { id: "h2a_attention", label: "What H-2A records need attention?" },
  { id: "field_activity", label: "Summarize activity on a field.", needsField: true },
];

export default function AskFarmVoicePage() {
  const [supabase] = useState(() => createClient());
  const [farms, setFarms] = useState<FarmContext[]>([]);
  const [farmId, setFarmId] = useState("");
  const [promptId, setPromptId] = useState<PromptId>("incomplete_records");
  const [field, setField] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [message, setMessage] = useState("Loading your farms...");
  const [loading, setLoading] = useState(false);

  const selected = useMemo(() => questions.find((q) => q.id === promptId)!, [promptId]);

  useEffect(() => {
    getNamedFarmContexts(supabase)
      .then((rows) => {
        const owned = rows.filter((row) => row.role === "owner");
        setFarms(owned);
        const remembered = localStorage.getItem("farmvoice_selected_farm_id");
        const initial = owned.find((row) => row.farmId === remembered)?.farmId ?? owned[0]?.farmId ?? "";
        setFarmId(initial);
        setMessage(owned.length ? "" : "Farm owner access is required to use Ask FarmVoice.");
      })
      .catch(() => setMessage("Unable to load your farms."));
  }, [supabase]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!farmId) return setMessage("Choose a farm.");
    if (selected.needsField && !field.trim()) return setMessage("Enter a field name.");
    setLoading(true);
    setAnswer(null);
    setMessage("Reviewing farm records...");
    try {
      rememberFarmSelection(farmId);
      const response = await fetch("/api/ask-farmvoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmId,
          promptId,
          field: field.trim() || undefined,
          start: start || undefined,
          end: end || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Ask FarmVoice could not complete that review.");
      setAnswer(body);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ask FarmVoice could not complete that review.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">Farm intelligence</div>
        <h1>Ask FarmVoice</h1>
        <p className="lede">
          Ask common operational questions across the records already stored in your farm.
          FarmVoice calculates totals from the database and shows the underlying records instead
          of asking an AI model to guess.
        </p>
      </div>

      <form className="card form" onSubmit={ask}>
        {farms.length > 1 && (
          <div className="field">
            <label htmlFor="ask-farm">Farm</label>
            <select id="ask-farm" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
              {farms.map((farm) => (
                <option key={farm.farmId} value={farm.farmId}>{farm.farmName ?? farm.farmId}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="ask-question">Question</label>
          <select id="ask-question" value={promptId} onChange={(e) => setPromptId(e.target.value as PromptId)}>
            {questions.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
          </select>
        </div>
        {selected.needsField && (
          <div className="field">
            <label htmlFor="ask-field">Field name</label>
            <input id="ask-field" value={field} onChange={(e) => setField(e.target.value)} placeholder="North Field" />
          </div>
        )}
        <div className="row">
          <div className="field">
            <label htmlFor="ask-start">Start date (optional)</label>
            <input id="ask-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ask-end">End date (optional)</label>
            <input id="ask-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="inline">
          <button className="btn" disabled={loading}>{loading ? "Reviewing..." : "Ask FarmVoice"}</button>
          <Link className="btn secondary" href="/inspection-package">Prepare Inspection Package</Link>
        </div>
      </form>

      {message && <div className="notice">{message}</div>}

      {answer && (
        <section className="card stack" aria-live="polite">
          <div>
            <div className="kicker">FarmVoice answer</div>
            <h2>{answer.title}</h2>
            <p>{answer.answer}</p>
          </div>
          {answer.metrics?.length ? (
            <div className="grid-3">
              {answer.metrics.map((metric) => (
                <div className="card" key={metric.label}>
                  <div className="small muted">{metric.label}</div>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          {answer.rows?.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr><th>Date</th><th>Type</th><th>Status / detail</th></tr></thead>
                <tbody>
                  {answer.rows.map((row) => (
                    <tr key={row.id + (row.detail ?? "")}>
                      <td>{row.date ? new Date(row.date).toLocaleDateString() : "—"}</td>
                      <td>{row.type ?? "record"}</td>
                      <td>{row.status ? `${row.status} · ` : ""}{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {answer.note && <p className="small muted">{answer.note}</p>}
        </section>
      )}
    </main>
  );
}
