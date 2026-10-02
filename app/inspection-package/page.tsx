"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getNamedFarmContexts, rememberFarmSelection, type FarmContext } from "@/src/lib/farm-cloud";
import { recordReviewProblems } from "@/src/lib/ask-farmvoice";
import { collectPages, csvCell } from "@/src/lib/pagination";

type RecordRow = {
  id: string;
  record_type: "pesticide" | "purchase";
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
};
type Evidence = {
  id: string;
  record_id: string;
  file_name: string | null;
  category: string;
  captured_at: string;
};


export default function InspectionPackagePage() {
  const [supabase] = useState(() => createClient());
  const [farms, setFarms] = useState<FarmContext[]>([]);
  const [farmId, setFarmId] = useState("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [message, setMessage] = useState("Loading your farms...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getNamedFarmContexts(supabase)
      .then((rows) => {
        const owned = rows.filter((row) => row.role === "owner");
        setFarms(owned);
        const remembered = localStorage.getItem("farmvoice_selected_farm_id");
        const initial = owned.find((row) => row.farmId === remembered)?.farmId ?? owned[0]?.farmId ?? "";
        setFarmId(initial);
        setMessage(owned.length ? "" : "Farm owner access is required.");
      })
      .catch(() => setMessage("Unable to load your farms."));
  }, [supabase]);

  const reviewCount = useMemo(
    () => records.filter((row) => recordReviewProblems(row).length).length,
    [records],
  );

  async function prepare() {
    if (!farmId) return setMessage("Choose a farm.");
    setLoading(true);
    setMessage("Preparing inspection package...");
    rememberFarmSelection(farmId);
    try {
      const recordRows = await collectPages<RecordRow>((from, to) => {
        let query = supabase
          .from("farm_records")
          .select("id,record_type,status,payload,created_at")
          .eq("farm_id", farmId)
          .eq("record_type", "pesticide")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        if (start) query = query.gte("created_at", start + "T00:00:00.000Z");
        if (end) query = query.lte("created_at", end + "T23:59:59.999Z");
        return query.range(from, to);
      });

      const recordIds = new Set(recordRows.map((row) => row.id));
      const allEvidence = recordIds.size
        ? await collectPages<Evidence>((from, to) =>
            supabase
              .from("farm_photo_evidence")
              .select("id,record_id,file_name,category,captured_at")
              .eq("farm_id", farmId)
              .eq("module", "records")
              .eq("record_type", "farm_record")
              .order("captured_at", { ascending: false })
              .order("id", { ascending: false })
              .range(from, to),
          )
        : [];
      const evidenceRows = allEvidence.filter((item) =>
        recordIds.has(item.record_id),
      );

      setRecords(recordRows);
      setEvidence(evidenceRows);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to prepare the package.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    const rows = [
      ["record_id","application_date","field","product","epa_registration","applicator","certification","amount","area","status","review_items","evidence_count"],
      ...records.map((row) => {
        const p = row.payload ?? {};
        return [
          row.id,
          p.applicationDate,
          p.fieldLocation,
          p.productName,
          p.epaRegNumber,
          p.applicatorName,
          p.certificationNumber,
          [p.amountApplied,p.amountUnit].filter(Boolean).join(" "),
          [p.areaTreated,p.areaUnit].filter(Boolean).join(" "),
          row.status,
          recordReviewProblems(row).join("; "),
          evidence.filter((item) => item.record_id === row.id).length,
        ];
      }),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `farmvoice-inspection-package-${start || "all"}-${end || "today"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container section stack">
      <div className="no-print">
        <div className="kicker">Inspector-ready records</div>
        <h1>Prepare Inspection Package</h1>
        <p className="lede">
          Assemble pesticide records and their linked evidence for a date range. Review flagged
          fields before sharing.
        </p>
      </div>
      <p className="notice">
        <strong>Important:</strong> FarmVoice does not certify that this packet satisfies every
        federal, state, label, or inspection requirement. Verify the records before relying on
        or submitting the package.
      </p>

      <section className="card form no-print">
        {farms.length > 1 && (
          <div className="field">
            <label htmlFor="package-farm">Farm</label>
            <select id="package-farm" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
              {farms.map((farm) => <option key={farm.farmId} value={farm.farmId}>{farm.farmName ?? farm.farmId}</option>)}
            </select>
          </div>
        )}
        <div className="row">
          <div className="field"><label htmlFor="package-start">Start date</label><input id="package-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="field"><label htmlFor="package-end">End date</label><input id="package-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="inline">
          <button className="btn" onClick={prepare} disabled={loading}>{loading ? "Preparing..." : "Prepare package"}</button>
          <button className="btn secondary" type="button" onClick={() => window.print()} disabled={!records.length}>Print / Save PDF</button>
          <button className="btn secondary" type="button" onClick={downloadCsv} disabled={!records.length}>Download CSV index</button>
          <Link href="/ask-farmvoice">Ask FarmVoice</Link>
        </div>
      </section>

      {message && <div className="notice no-print">{message}</div>}

      {records.length > 0 && (
        <section className="stack">
          <header>
            <h2>FarmVoice Records — Pesticide Inspection Package</h2>
            <p>
              Range: {start || "earliest record"} through {end || "today"} ·
              {" "}{records.length} record(s) · {reviewCount} record(s) flagged for review ·
              {" "}{evidence.length} linked evidence file(s)
            </p>
          </header>
          {records.map((row) => {
            const p = row.payload ?? {};
            const problems = recordReviewProblems(row);
            const files = evidence.filter((item) => item.record_id === row.id);
            return (
              <article className="card stack" key={row.id}>
                <div className="inline" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h3>{String(p.productName ?? "Pesticide application")}</h3>
                    <p className="small muted">{String(p.applicationDate ?? row.created_at)} · {String(p.fieldLocation ?? "Field not entered")}</p>
                  </div>
                  <strong>{row.status}</strong>
                </div>
                <dl>
                  <dt>Applicator</dt><dd>{String(p.applicatorName ?? "—")}</dd>
                  <dt>Certification number</dt><dd>{String(p.certificationNumber ?? "—")}</dd>
                  <dt>EPA registration number</dt><dd>{String(p.epaRegNumber ?? "—")}</dd>
                  <dt>Total amount applied</dt><dd>{[p.amountApplied,p.amountUnit].filter(Boolean).join(" ") || "—"}</dd>
                  <dt>Crop / site</dt><dd>{String(p.cropOrSite ?? "—")}</dd>
                  <dt>Area treated</dt><dd>{[p.areaTreated,p.areaUnit].filter(Boolean).join(" ") || "—"}</dd>
                </dl>
                {problems.length ? (
                  <div className="notice warn"><strong>Review before sharing:</strong> {problems.join(", ")}</div>
                ) : (
                  <div className="notice">No missing items were found by the current FarmVoice completeness checks.</div>
                )}
                <div>
                  <strong>Linked evidence ({files.length})</strong>
                  {files.length ? (
                    <ul>{files.map((file) => <li key={file.id}>{file.file_name ?? file.category} · {new Date(file.captured_at).toLocaleString()}</li>)}</ul>
                  ) : <p className="small muted">No linked evidence files.</p>}
                </div>
                <p className="small muted">Record ID: {row.id}</p>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
