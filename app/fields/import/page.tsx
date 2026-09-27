"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getFarmContext, type FarmContext } from "@/src/lib/farm-cloud";

type Result = { inserted:number; updated:number; skipped:number; totalPolygons:number; filename:string; error?:string };

export default function ImportUsdaFieldsPage() {
  const [supabase] = useState(() => createClient());
  const [ctx,setCtx] = useState<FarmContext|null>(null);
  const [file,setFile] = useState<File|null>(null);
  const [message,setMessage] = useState("Loading farm...");
  const [result,setResult] = useState<Result|null>(null);
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const c = await getFarmContext(supabase);
      setCtx(c);
      if (!c) setMessage("Sign in and open your farm before importing USDA fields.");
      else if (c.role !== "owner") setMessage("Only the farm owner can import USDA field boundaries.");
      else setMessage("Choose the ZIP shapefile or GeoJSON file downloaded from farmers.gov.");
    })();
  }, [supabase]);

  async function importFile() {
    if (!ctx || ctx.role !== "owner" || !file) return;
    setBusy(true); setResult(null); setMessage("Importing USDA field boundaries...");
    const body = new FormData();
    body.append("farm_id", ctx.farmId);
    body.append("file", file);
    const { data, error } = await supabase.functions.invoke("import-usda-fields", { body });
    setBusy(false);
    if (error) { setMessage(`Import failed: ${error.message}`); return; }
    const r = data as Result;
    if (r.error) { setMessage(`Import failed: ${r.error}`); return; }
    setResult(r);
    setMessage(`Imported ${r.inserted} new field(s) and updated ${r.updated} existing field(s).`);
  }

  return <main className="container section stack">
    <div>
      <div className="kicker">USDA / FSA field boundaries</div>
      <h2>Import fields from farmers.gov</h2>
      <p className="muted">Download your field boundaries from farmers.gov as an ESRI shapefile ZIP or GeoJSON. On supported Android phones, install FarmVoice to your Home Screen and use Share → FarmVoice after the download.</p>
    </div>
    <section className="card form">
      <div className="field">
        <label>USDA boundary file</label>
        <input type="file" accept=".zip,.geojson,.json,application/zip,application/geo+json,application/json" onChange={e=>setFile(e.target.files?.[0]??null)} />
      </div>
      <button className="btn" disabled={!file || !ctx || ctx.role!=="owner" || busy} onClick={()=>void importFile()}>{busy?"Importing...":"Import USDA fields"}</button>
      <p className="small muted">FarmVoice reads the FSA Farm, Tract, Field and CLU identifiers plus the polygon boundary. Existing matching fields are updated instead of duplicated.</p>
    </section>
    {message && <div className="notice">{message}</div>}
    {result && <section className="card">
      <h3>Import complete</h3>
      <p><strong>{result.filename}</strong></p>
      <p>{result.inserted} created · {result.updated} updated · {result.skipped} skipped · {result.totalPolygons} polygon(s) read</p>
      <Link className="btn" href="/fields">Review imported fields</Link>
    </section>}
  </main>;
}
