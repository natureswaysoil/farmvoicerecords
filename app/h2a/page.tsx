"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getFarmContext, type FarmContext } from "@/src/lib/farm-cloud";

type Contract = {
  id: string;
  name: string;
  eta_case_number: string | null;
  job_order_number: string | null;
  start_date: string;
  end_date: string;
  crop_or_commodity: string | null;
  expected_hours_per_day: number | null;
  expected_days_per_week: number | null;
  hourly_wage: number | null;
  active: boolean;
};

type Worker = {
  id: string;
  contract_id: string | null;
  employee_number: string;
  legal_name: string;
  preferred_name: string | null;
  worker_type: string;
  preferred_language: string | null;
  arrival_date: string | null;
  work_authorization_end: string | null;
  status: string;
};

type DailyRecord = {
  id: string;
  worker_id: string;
  work_date: string;
  crew_name: string | null;
  worksite: string | null;
  field_name: string | null;
  job: string | null;
  hours_offered: number;
  hours_worked: number;
  piece_unit: string | null;
  piece_quantity: number | null;
  submitted_at: string;
  locked_at: string | null;
  approved_at: string | null;
};

type Housing = {
  id: string;
  name: string;
  address: string;
  max_occupancy: number | null;
  certificate_expires_on: string | null;
};

type H2aRole = {
  user_id: string;
  role: string;
};

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(name: string, rows: unknown[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function H2APage() {
  const [supabase] = useState(() => createClient());
  const [ctx, setCtx] = useState<FarmContext | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  const [housing, setHousing] = useState<Housing[]>([]);
  const [roles, setRoles] = useState<H2aRole[]>([]);
  const [message, setMessage] = useState("Loading H-2A records...");
  const [gps, setGps] = useState<{lat:number;lng:number;accuracy:number;capturedAt:string}|null>(null);

  const [contractForm, setContractForm] = useState({
    name: "Seasonal H-2A Crew",
    etaCase: "",
    jobOrder: "",
    start: "",
    end: "",
    crop: "",
    hoursDay: "8",
    daysWeek: "6",
    wage: "",
  });
  const [workerForm, setWorkerForm] = useState({
    employeeNumber: "",
    legalName: "",
    preferredName: "",
    contractId: "",
    workerType: "h2a",
    language: "",
    arrivalDate: "",
    authorizationEnd: "",
  });
  const [crewForm, setCrewForm] = useState({
    contractId: "",
    workDate: new Date().toISOString().slice(0,10),
    crewName: "Crew A",
    worksite: "",
    fieldName: "",
    job: "Field work",
    hoursOffered: "8",
    hoursWorked: "8",
    pieceUnit: "",
  });
  const [pieceCounts, setPieceCounts] = useState<Record<string,string>>({});
  const [selectedWorkers, setSelectedWorkers] = useState<Record<string,boolean>>({});
  const [housingForm, setHousingForm] = useState({name:"",address:"",maxOccupancy:"",expires:""});
  const [transportForm, setTransportForm] = useState({workerId:"",type:"daily",date:new Date().toISOString().slice(0,10),origin:"",destination:"",workerPaid:"0",employerPaid:"0",reimbursementDue:"0"});
  const [trainingForm, setTrainingForm] = useState({workerId:"",type:"Worker Protection Standard",date:new Date().toISOString().slice(0,10),instructor:"",language:""});
  const [recruitmentForm, setRecruitmentForm] = useState({contractId:"",applicant:"",date:new Date().toISOString().slice(0,10),method:"phone",source:"",disposition:"pending",reason:""});
  const [separationForm, setSeparationForm] = useState({workerId:"",date:new Date().toISOString().slice(0,10),type:"completed",reason:""});

  const isOwner = ctx?.role === "owner";
  const canAdmin = isOwner || roles.some((r) => r.user_id === ctx?.userId && r.role === "h2a_admin");
  const canCrew = canAdmin || roles.some((r) => r.user_id === ctx?.userId && r.role === "crew_leader");

  const workerName = useMemo(() => new Map(workers.map((w) => [w.id, w.preferred_name || w.legal_name])), [workers]);

  async function load() {
    try {
      const farm = await getFarmContext(supabase);
      if (!farm) {
        setMessage("Sign in and join a farm before using H-2A records.");
        return;
      }
      setCtx(farm);
      const [c,w,d,h,r] = await Promise.all([
        supabase.from("h2a_contracts").select("id,name,eta_case_number,job_order_number,start_date,end_date,crop_or_commodity,expected_hours_per_day,expected_days_per_week,hourly_wage,active").eq("farm_id",farm.farmId).order("start_date",{ascending:false}),
        supabase.from("h2a_workers").select("id,contract_id,employee_number,legal_name,preferred_name,worker_type,preferred_language,arrival_date,work_authorization_end,status").eq("farm_id",farm.farmId).order("employee_number"),
        supabase.from("h2a_daily_records").select("id,worker_id,work_date,crew_name,worksite,field_name,job,hours_offered,hours_worked,piece_unit,piece_quantity,submitted_at,locked_at,approved_at").eq("farm_id",farm.farmId).order("work_date",{ascending:false}).limit(250),
        supabase.from("h2a_housing").select("id,name,address,max_occupancy,certificate_expires_on").eq("farm_id",farm.farmId).order("name"),
        supabase.from("h2a_user_roles").select("user_id,role").eq("farm_id",farm.farmId),
      ]);
      for (const result of [c,w,d,h,r]) if (result.error) throw result.error;
      setContracts((c.data ?? []) as Contract[]);
      setWorkers((w.data ?? []) as Worker[]);
      setDaily((d.data ?? []) as DailyRecord[]);
      setHousing((h.data ?? []) as Housing[]);
      setRoles((r.data ?? []) as H2aRole[]);
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load H-2A records.");
    }
  }

  useEffect(() => { void load(); }, [supabase]);

  async function createContract(e: FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    const { error } = await supabase.from("h2a_contracts").insert({
      farm_id: ctx.farmId,
      name: contractForm.name.trim(),
      eta_case_number: contractForm.etaCase.trim() || null,
      job_order_number: contractForm.jobOrder.trim() || null,
      start_date: contractForm.start,
      end_date: contractForm.end,
      crop_or_commodity: contractForm.crop.trim() || null,
      expected_hours_per_day: Number(contractForm.hoursDay) || null,
      expected_days_per_week: Number(contractForm.daysWeek) || null,
      hourly_wage: Number(contractForm.wage) || null,
      created_by: ctx.userId,
    });
    setMessage(error ? error.message : "H-2A contract saved.");
    if (!error) void load();
  }

  async function createWorker(e: FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    const { error } = await supabase.from("h2a_workers").insert({
      farm_id: ctx.farmId,
      contract_id: workerForm.contractId || null,
      employee_number: workerForm.employeeNumber.trim(),
      legal_name: workerForm.legalName.trim(),
      preferred_name: workerForm.preferredName.trim() || null,
      worker_type: workerForm.workerType,
      preferred_language: workerForm.language.trim() || null,
      arrival_date: workerForm.arrivalDate || null,
      work_authorization_end: workerForm.authorizationEnd || null,
      created_by: ctx.userId,
    });
    setMessage(error ? error.message : "Worker added. No worker phone or FarmVoice login is required.");
    if (!error) {
      setWorkerForm((x) => ({...x,employeeNumber:"",legalName:"",preferredName:""}));
      void load();
    }
  }

  function captureGps() {
    if (!navigator.geolocation) return setMessage("GPS is unavailable on this device.");
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date().toISOString()}),
      (e) => setMessage(`GPS unavailable: ${e.message}`),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );
  }

  async function submitCrewDay(e: FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    const ids = Object.entries(selectedWorkers).filter(([,v]) => v).map(([id]) => id);
    if (!ids.length) return setMessage("Select at least one worker for the crew record.");
    const rows = ids.map((workerId) => ({
      farm_id: ctx.farmId,
      contract_id: crewForm.contractId || workers.find((w) => w.id === workerId)?.contract_id || null,
      worker_id: workerId,
      work_date: crewForm.workDate,
      crew_name: crewForm.crewName.trim() || null,
      worksite: crewForm.worksite.trim() || null,
      field_name: crewForm.fieldName.trim() || null,
      job: crewForm.job.trim() || null,
      hours_offered: Number(crewForm.hoursOffered) || 0,
      hours_worked: Number(crewForm.hoursWorked) || 0,
      piece_unit: crewForm.pieceUnit.trim() || null,
      piece_quantity: pieceCounts[workerId] ? Number(pieceCounts[workerId]) : null,
      gps_lat: gps?.lat ?? null,
      gps_lng: gps?.lng ?? null,
      gps_accuracy_m: gps?.accuracy ?? null,
      gps_captured_at: gps?.capturedAt ?? null,
      submitted_by: ctx.userId,
      crew_leader_attested_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("h2a_daily_records").upsert(rows,{onConflict:"farm_id,worker_id,work_date"});
    setMessage(error ? error.message : `Saved and locked ${rows.length} crew records. Later changes require a reason and remain auditable.`);
    if (!error) {
      setSelectedWorkers({});
      setPieceCounts({});
      void load();
    }
  }

  async function approveRecord(id: string) {
    if (!ctx) return;
    const { error } = await supabase.from("h2a_daily_records").update({
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
    }).eq("id",id);
    setMessage(error ? error.message : "Daily record approved and locked.");
    if (!error) void load();
  }

  async function addHousing(e: FormEvent) {
    e.preventDefault(); if (!ctx) return;
    const { error } = await supabase.from("h2a_housing").insert({
      farm_id:ctx.farmId,name:housingForm.name.trim(),address:housingForm.address.trim(),
      max_occupancy:Number(housingForm.maxOccupancy)||null,certificate_expires_on:housingForm.expires||null,created_by:ctx.userId
    });
    setMessage(error?error.message:"Housing record saved."); if(!error) void load();
  }

  async function addTransport(e: FormEvent) {
    e.preventDefault(); if(!ctx) return;
    const {error}=await supabase.from("h2a_transportation").insert({
      farm_id:ctx.farmId,worker_id:transportForm.workerId||null,transport_type:transportForm.type,travel_date:transportForm.date,
      origin:transportForm.origin||null,destination:transportForm.destination||null,worker_paid:Number(transportForm.workerPaid)||0,
      employer_paid:Number(transportForm.employerPaid)||0,reimbursement_due:Number(transportForm.reimbursementDue)||0,created_by:ctx.userId
    });
    setMessage(error?error.message:"Transportation/reimbursement record saved.");
  }

  async function addTraining(e: FormEvent) {
    e.preventDefault(); if(!ctx) return;
    const {error}=await supabase.from("h2a_training").insert({
      farm_id:ctx.farmId,worker_id:trainingForm.workerId||null,training_type:trainingForm.type,training_date:trainingForm.date,
      instructor:trainingForm.instructor||null,language:trainingForm.language||null,created_by:ctx.userId
    });
    setMessage(error?error.message:"Training record saved.");
  }

  async function addRecruitment(e: FormEvent) {
    e.preventDefault(); if(!ctx) return;
    const {error}=await supabase.from("h2a_recruitment").insert({
      farm_id:ctx.farmId,contract_id:recruitmentForm.contractId||null,applicant_name:recruitmentForm.applicant||null,
      contact_date:recruitmentForm.date,contact_method:recruitmentForm.method,recruitment_source:recruitmentForm.source||null,
      disposition:recruitmentForm.disposition,disposition_reason:recruitmentForm.reason||null,created_by:ctx.userId
    });
    setMessage(error?error.message:"Recruitment contact saved.");
  }

  async function addSeparation(e: FormEvent) {
    e.preventDefault(); if(!ctx) return;
    const {error}=await supabase.from("h2a_separations").insert({
      farm_id:ctx.farmId,worker_id:separationForm.workerId,separation_date:separationForm.date,
      separation_type:separationForm.type,reason:separationForm.reason||null,created_by:ctx.userId
    });
    setMessage(error?error.message:"Separation review record saved.");
  }

  async function exportAudit() {
    if(!ctx) return;
    const [contractsR,workersR,dailyR,housingR,transportR,trainingR,recruitmentR,separationsR] = await Promise.all([
      supabase.from("h2a_contracts").select("*").eq("farm_id",ctx.farmId),
      supabase.from("h2a_workers").select("*").eq("farm_id",ctx.farmId),
      supabase.from("h2a_daily_records").select("*").eq("farm_id",ctx.farmId),
      supabase.from("h2a_housing").select("*").eq("farm_id",ctx.farmId),
      supabase.from("h2a_transportation").select("*").eq("farm_id",ctx.farmId),
      supabase.from("h2a_training").select("*").eq("farm_id",ctx.farmId),
      supabase.from("h2a_recruitment").select("*").eq("farm_id",ctx.farmId),
      supabase.from("h2a_separations").select("*").eq("farm_id",ctx.farmId),
    ]);
    const sections:[string,unknown[]][]=[
      ["contracts",contractsR.data??[]],["workers",workersR.data??[]],["daily_records",dailyR.data??[]],
      ["housing",housingR.data??[]],["transportation",transportR.data??[]],["training",trainingR.data??[]],
      ["recruitment",recruitmentR.data??[]],["separations",separationsR.data??[]]
    ];
    const rows:unknown[][]=[["FarmVoice H-2A audit export"],["Generated",new Date().toISOString()]];
    for(const [name,items] of sections){
      rows.push([],["SECTION",name]);
      const objects=items as Record<string,unknown>[];
      const headers=[...new Set(objects.flatMap((o)=>Object.keys(o)))];
      rows.push(headers);
      for(const o of objects) rows.push(headers.map((h)=>typeof o[h]==="object"?JSON.stringify(o[h]):o[h]));
    }
    downloadCsv("farmvoice-h2a-audit-export.csv",rows);
  }

  const activeContract = contracts.find((c) => c.active);
  const guarantee = activeContract && activeContract.expected_hours_per_day && activeContract.expected_days_per_week
    ? Number(activeContract.expected_hours_per_day) * Number(activeContract.expected_days_per_week)
    : null;
  const offeredTotal = daily.reduce((s,r)=>s+Number(r.hours_offered||0),0);
  const workedTotal = daily.reduce((s,r)=>s+Number(r.hours_worked||0),0);

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">H-2A employer records</div>
        <h1 style={{fontSize:"clamp(36px,6vw,60px)"}}>Crew records without requiring worker phones</h1>
        <p className="lede">
          Contract records, worker roster, crew-leader daily time, hours offered, piecework, housing, transportation,
          training, recruitment, separation review, approvals and audit exports. FarmVoice prepares records for review;
          it does not determine legal compliance.
        </p>
      </div>

      {message && <div className="notice">{message}</div>}

      <section className="grid-3">
        <div className="card"><div className="kicker">Active workers</div><div className="stat">{workers.filter(w=>w.status==="active"||w.status==="expected").length}</div></div>
        <div className="card"><div className="kicker">Hours offered</div><div className="stat">{offeredTotal.toFixed(1)}</div><p className="small muted">Recorded in FarmVoice</p></div>
        <div className="card"><div className="kicker">Hours worked</div><div className="stat">{workedTotal.toFixed(1)}</div><p className="small muted">Recorded in FarmVoice</p></div>
      </section>

      <section className="card stack">
        <div className="inline" style={{justifyContent:"space-between"}}>
          <div><div className="kicker">Audit readiness</div><h2>H-2A review dashboard</h2></div>
          <button className="btn secondary" onClick={exportAudit}>Download H-2A audit CSV</button>
        </div>
        <div className="grid-3">
          <div className="notice"><strong>Three-fourths review</strong><p className="small">Track hours offered against contract expectations. FarmVoice flags records for review rather than declaring compliance.</p></div>
          <div className="notice"><strong>Crew accountability</strong><p className="small">Daily crew records are timestamped, GPS-capable, attested by the submitting leader, locked, and audited.</p></div>
          <div className="notice"><strong>Worker phones optional</strong><p className="small">Workers are roster records. A crew leader can maintain the day's records from one phone or tablet.</p></div>
        </div>
        {guarantee != null && <p className="muted">Current contract schedule baseline: {guarantee.toFixed(1)} hours per configured week; three-fourths reference: {(guarantee*0.75).toFixed(1)} hours. Verify the job order and applicable rules before relying on this calculation.</p>}
      </section>

      {canAdmin && <section className="grid-2">
        <form className="card form" onSubmit={createContract}>
          <div><div className="kicker">Contract</div><h2>Add H-2A job order</h2></div>
          <div className="field"><label>Contract name</label><input required value={contractForm.name} onChange={e=>setContractForm({...contractForm,name:e.target.value})}/></div>
          <div className="row"><div className="field"><label>ETA case</label><input value={contractForm.etaCase} onChange={e=>setContractForm({...contractForm,etaCase:e.target.value})}/></div><div className="field"><label>Job order</label><input value={contractForm.jobOrder} onChange={e=>setContractForm({...contractForm,jobOrder:e.target.value})}/></div></div>
          <div className="row"><div className="field"><label>Start</label><input type="date" required value={contractForm.start} onChange={e=>setContractForm({...contractForm,start:e.target.value})}/></div><div className="field"><label>End</label><input type="date" required value={contractForm.end} onChange={e=>setContractForm({...contractForm,end:e.target.value})}/></div></div>
          <div className="field"><label>Crop / commodity</label><input value={contractForm.crop} onChange={e=>setContractForm({...contractForm,crop:e.target.value})}/></div>
          <div className="row"><div className="field"><label>Expected hours/day</label><input inputMode="decimal" value={contractForm.hoursDay} onChange={e=>setContractForm({...contractForm,hoursDay:e.target.value})}/></div><div className="field"><label>Expected days/week</label><input inputMode="decimal" value={contractForm.daysWeek} onChange={e=>setContractForm({...contractForm,daysWeek:e.target.value})}/></div></div>
          <div className="field"><label>Configured hourly wage</label><input inputMode="decimal" value={contractForm.wage} onChange={e=>setContractForm({...contractForm,wage:e.target.value})}/></div>
          <button className="btn">Save contract</button>
        </form>

        <form className="card form" onSubmit={createWorker}>
          <div><div className="kicker">Worker roster</div><h2>Add worker</h2></div>
          <p className="small muted">No email, phone, or FarmVoice login is required.</p>
          <div className="row"><div className="field"><label>Employee number</label><input required value={workerForm.employeeNumber} onChange={e=>setWorkerForm({...workerForm,employeeNumber:e.target.value})}/></div><div className="field"><label>Legal name</label><input required value={workerForm.legalName} onChange={e=>setWorkerForm({...workerForm,legalName:e.target.value})}/></div></div>
          <div className="field"><label>Preferred name</label><input value={workerForm.preferredName} onChange={e=>setWorkerForm({...workerForm,preferredName:e.target.value})}/></div>
          <div className="row"><div className="field"><label>Contract</label><select value={workerForm.contractId} onChange={e=>setWorkerForm({...workerForm,contractId:e.target.value})}><option value="">Select contract</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Worker type</label><select value={workerForm.workerType} onChange={e=>setWorkerForm({...workerForm,workerType:e.target.value})}><option value="h2a">H-2A</option><option value="corresponding">Corresponding U.S. worker</option><option value="domestic_ag">Domestic agricultural</option><option value="supervisor">Supervisor</option><option value="other">Other</option></select></div></div>
          <div className="row"><div className="field"><label>Preferred language</label><input value={workerForm.language} onChange={e=>setWorkerForm({...workerForm,language:e.target.value})}/></div><div className="field"><label>Arrival date</label><input type="date" value={workerForm.arrivalDate} onChange={e=>setWorkerForm({...workerForm,arrivalDate:e.target.value})}/></div></div>
          <div className="field"><label>Work authorization end</label><input type="date" value={workerForm.authorizationEnd} onChange={e=>setWorkerForm({...workerForm,authorizationEnd:e.target.value})}/></div>
          <button className="btn">Add worker</button>
        </form>
      </section>}

      {canCrew && <form className="card form" onSubmit={submitCrewDay}>
        <div className="inline" style={{justifyContent:"space-between"}}><div><div className="kicker">Crew leader</div><h2>Daily crew record</h2></div><button type="button" className="btn secondary" onClick={captureGps}>{gps?"Recapture GPS":"Capture crew GPS"}</button></div>
        {gps && <div className="notice">Crew GPS {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} · ±{Math.round(gps.accuracy)}m</div>}
        <div className="row"><div className="field"><label>Date</label><input type="date" value={crewForm.workDate} onChange={e=>setCrewForm({...crewForm,workDate:e.target.value})}/></div><div className="field"><label>Crew</label><input value={crewForm.crewName} onChange={e=>setCrewForm({...crewForm,crewName:e.target.value})}/></div></div>
        <div className="row"><div className="field"><label>Contract</label><select value={crewForm.contractId} onChange={e=>setCrewForm({...crewForm,contractId:e.target.value})}><option value="">Use worker contract</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Job</label><input value={crewForm.job} onChange={e=>setCrewForm({...crewForm,job:e.target.value})}/></div></div>
        <div className="row"><div className="field"><label>Worksite</label><input value={crewForm.worksite} onChange={e=>setCrewForm({...crewForm,worksite:e.target.value})}/></div><div className="field"><label>Field</label><input value={crewForm.fieldName} onChange={e=>setCrewForm({...crewForm,fieldName:e.target.value})}/></div></div>
        <div className="row"><div className="field"><label>Hours offered to selected workers</label><input inputMode="decimal" value={crewForm.hoursOffered} onChange={e=>setCrewForm({...crewForm,hoursOffered:e.target.value})}/></div><div className="field"><label>Default hours worked</label><input inputMode="decimal" value={crewForm.hoursWorked} onChange={e=>setCrewForm({...crewForm,hoursWorked:e.target.value})}/></div></div>
        <div className="field"><label>Piece unit (optional)</label><input placeholder="boxes, buckets, bins" value={crewForm.pieceUnit} onChange={e=>setCrewForm({...crewForm,pieceUnit:e.target.value})}/></div>
        <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Include</th><th>Worker</th><th>Employee #</th><th>Piece count</th></tr></thead><tbody>{workers.filter(w=>w.status!=="separated").map(w=><tr key={w.id}><td><input type="checkbox" checked={Boolean(selectedWorkers[w.id])} onChange={e=>setSelectedWorkers({...selectedWorkers,[w.id]:e.target.checked})}/></td><td>{w.preferred_name||w.legal_name}</td><td>{w.employee_number}</td><td><input style={{maxWidth:120}} inputMode="decimal" value={pieceCounts[w.id]??""} onChange={e=>setPieceCounts({...pieceCounts,[w.id]:e.target.value})}/></td></tr>)}</tbody></table></div>
        <label className="inline"><input type="checkbox" required/> I reviewed this crew record and confirm the attendance, hours offered, hours worked, and production entries are accurate to the best of my knowledge.</label>
        <button className="btn">Submit & lock crew records</button>
      </form>}

      <section className="card">
        <div className="inline" style={{justifyContent:"space-between"}}><div><div className="kicker">Daily review</div><h2>Recent H-2A crew records</h2></div></div>
        {daily.length ? <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Date</th><th>Worker</th><th>Hours offered</th><th>Hours worked</th><th>Pieces</th><th>Status</th>{canAdmin&&<th>Approve</th>}</tr></thead><tbody>{daily.slice(0,50).map(r=><tr key={r.id}><td>{r.work_date}</td><td>{workerName.get(r.worker_id)??r.worker_id.slice(0,8)}</td><td>{r.hours_offered}</td><td>{r.hours_worked}</td><td>{r.piece_quantity??"—"} {r.piece_unit??""}</td><td>{r.approved_at?"Approved":r.locked_at?"Locked / review":"Draft"}</td>{canAdmin&&<td>{r.approved_at?"—":<button className="btn secondary" onClick={()=>approveRecord(r.id)}>Approve</button>}</td>}</tr>)}</tbody></table></div>:<p className="muted">No crew records yet.</p>}
      </section>

      {canAdmin && <section className="grid-2">
        <form className="card form" onSubmit={addHousing}><div><div className="kicker">Housing</div><h2>Add housing record</h2></div><div className="field"><label>Name</label><input required value={housingForm.name} onChange={e=>setHousingForm({...housingForm,name:e.target.value})}/></div><div className="field"><label>Address</label><input required value={housingForm.address} onChange={e=>setHousingForm({...housingForm,address:e.target.value})}/></div><div className="row"><div className="field"><label>Max occupancy</label><input inputMode="numeric" value={housingForm.maxOccupancy} onChange={e=>setHousingForm({...housingForm,maxOccupancy:e.target.value})}/></div><div className="field"><label>Certificate expires</label><input type="date" value={housingForm.expires} onChange={e=>setHousingForm({...housingForm,expires:e.target.value})}/></div></div><button className="btn">Save housing</button>{housing.length>0&&<p className="small muted">{housing.length} housing record(s) on file.</p>}</form>

        <form className="card form" onSubmit={addTransport}><div><div className="kicker">Transportation</div><h2>Travel & reimbursement</h2></div><div className="field"><label>Worker</label><select value={transportForm.workerId} onChange={e=>setTransportForm({...transportForm,workerId:e.target.value})}><option value="">Crew/general</option>{workers.map(w=><option key={w.id} value={w.id}>{w.employee_number} · {w.legal_name}</option>)}</select></div><div className="row"><div className="field"><label>Type</label><select value={transportForm.type} onChange={e=>setTransportForm({...transportForm,type:e.target.value})}><option value="inbound">Inbound</option><option value="daily">Daily</option><option value="outbound">Outbound</option><option value="other">Other</option></select></div><div className="field"><label>Date</label><input type="date" value={transportForm.date} onChange={e=>setTransportForm({...transportForm,date:e.target.value})}/></div></div><div className="row"><div className="field"><label>Origin</label><input value={transportForm.origin} onChange={e=>setTransportForm({...transportForm,origin:e.target.value})}/></div><div className="field"><label>Destination</label><input value={transportForm.destination} onChange={e=>setTransportForm({...transportForm,destination:e.target.value})}/></div></div><div className="row"><div className="field"><label>Worker paid</label><input value={transportForm.workerPaid} onChange={e=>setTransportForm({...transportForm,workerPaid:e.target.value})}/></div><div className="field"><label>Reimbursement due</label><input value={transportForm.reimbursementDue} onChange={e=>setTransportForm({...transportForm,reimbursementDue:e.target.value})}/></div></div><button className="btn">Save transportation</button></form>

        <form className="card form" onSubmit={addTraining}><div><div className="kicker">Training</div><h2>Worker training</h2></div><div className="field"><label>Worker</label><select value={trainingForm.workerId} onChange={e=>setTrainingForm({...trainingForm,workerId:e.target.value})}><option value="">Crew-wide / select later</option>{workers.map(w=><option key={w.id} value={w.id}>{w.employee_number} · {w.legal_name}</option>)}</select></div><div className="field"><label>Training type</label><input value={trainingForm.type} onChange={e=>setTrainingForm({...trainingForm,type:e.target.value})}/></div><div className="row"><div className="field"><label>Date</label><input type="date" value={trainingForm.date} onChange={e=>setTrainingForm({...trainingForm,date:e.target.value})}/></div><div className="field"><label>Instructor</label><input value={trainingForm.instructor} onChange={e=>setTrainingForm({...trainingForm,instructor:e.target.value})}/></div></div><div className="field"><label>Language</label><input value={trainingForm.language} onChange={e=>setTrainingForm({...trainingForm,language:e.target.value})}/></div><button className="btn">Save training</button></form>

        <form className="card form" onSubmit={addRecruitment}><div><div className="kicker">Recruitment</div><h2>Applicant contact</h2></div><div className="field"><label>Contract</label><select value={recruitmentForm.contractId} onChange={e=>setRecruitmentForm({...recruitmentForm,contractId:e.target.value})}><option value="">Select</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Applicant</label><input value={recruitmentForm.applicant} onChange={e=>setRecruitmentForm({...recruitmentForm,applicant:e.target.value})}/></div><div className="row"><div className="field"><label>Contact date</label><input type="date" value={recruitmentForm.date} onChange={e=>setRecruitmentForm({...recruitmentForm,date:e.target.value})}/></div><div className="field"><label>Disposition</label><select value={recruitmentForm.disposition} onChange={e=>setRecruitmentForm({...recruitmentForm,disposition:e.target.value})}><option value="pending">Pending</option><option value="hired">Hired</option><option value="declined">Declined</option><option value="rejected">Rejected</option></select></div></div><div className="field"><label>Source</label><input value={recruitmentForm.source} onChange={e=>setRecruitmentForm({...recruitmentForm,source:e.target.value})}/></div><div className="field"><label>Actual disposition reason</label><textarea value={recruitmentForm.reason} onChange={e=>setRecruitmentForm({...recruitmentForm,reason:e.target.value})}/></div><button className="btn">Save recruitment record</button></form>

        <form className="card form" onSubmit={addSeparation}><div><div className="kicker">Separation</div><h2>End-of-employment review</h2></div><div className="field"><label>Worker</label><select required value={separationForm.workerId} onChange={e=>setSeparationForm({...separationForm,workerId:e.target.value})}><option value="">Select worker</option>{workers.map(w=><option key={w.id} value={w.id}>{w.employee_number} · {w.legal_name}</option>)}</select></div><div className="row"><div className="field"><label>Date</label><input type="date" value={separationForm.date} onChange={e=>setSeparationForm({...separationForm,date:e.target.value})}/></div><div className="field"><label>Type</label><select value={separationForm.type} onChange={e=>setSeparationForm({...separationForm,type:e.target.value})}><option value="completed">Contract completed</option><option value="voluntary">Voluntary</option><option value="terminated">Terminated</option><option value="abandonment">Abandonment</option><option value="other">Other</option></select></div></div><div className="field"><label>Reason / facts</label><textarea value={separationForm.reason} onChange={e=>setSeparationForm({...separationForm,reason:e.target.value})}/></div><button className="btn">Save separation review</button></form>
      </section>}

      <section className="notice">
        <strong>Important:</strong> FarmVoice Records provides recordkeeping, workflow, calculation and document-management tools. It does not provide immigration, employment, legal, tax or regulatory advice and does not determine whether an employer is compliant with the H-2A program. Verify wage rates, hours, reimbursements, notices, filings, housing requirements and other obligations against the applicable job order, law and agency guidance before relying on or submitting FarmVoice-generated information.
      </section>
    </main>
  );
}
