"use client";
import { dailyHours } from "@/src/lib/h2a-hours";
import H2aWeeklyHours from "@/src/components/h2a-weekly-hours";
import { collectPages } from "@/src/lib/pagination";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/client";
import { type FarmContext } from "@/src/lib/farm-cloud";
import { loadH2aFarmChoices, pickH2aFarm, selectH2aFarm, type H2aFarmChoice } from "@/src/lib/h2a-farm-context";
import SmartPhotoEvidence from "@/src/components/smart-photo-evidence";
import {
  remapQueuedEvidenceRecordIdWithinLock,
  withEvidenceSerialization,
} from "@/src/lib/evidence-offline";
import {
  h2aDailyBatches,
  isRetryableH2aSyncError,
  saveH2aDailyRows,
  storeH2aDailyBatch,
  syncH2aDailyBatches,
  type H2aDailyRow,
} from "@/src/lib/h2a-offline";

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
  shift_minutes: number | null;
  paid_break_minutes: number | null;
  break_minutes: number;
  piece_unit: string | null;
  piece_quantity: number | null;
  submitted_at: string;
  locked_at: string | null;
  approved_at: string | null;
};

function queuedDailyForDisplay(row: H2aDailyRow): DailyRecord {
  const text = (value: unknown) => {
    const s = String(value ?? "").trim();
    return s || null;
  };
  const numberOrNull = (value: unknown) =>
    value == null || value === "" ? null : Number(value);
  return {
    id: row.id,
    worker_id: row.worker_id,
    work_date: row.work_date,
    crew_name: text(row.crew_name),
    worksite: text(row.worksite),
    field_name: text(row.field_name),
    job: text(row.job),
    hours_offered: Number(row.hours_offered ?? 0),
    hours_worked: Number(row.hours_worked ?? 0),
    shift_minutes: numberOrNull(row.shift_minutes),
    paid_break_minutes: numberOrNull(row.paid_break_minutes),
    break_minutes: Number(row.break_minutes ?? 0),
    piece_unit: text(row.piece_unit),
    piece_quantity: numberOrNull(row.piece_quantity),
    submitted_at: String(row.submitted_at ?? new Date().toISOString()),
    locked_at: text(row.locked_at),
    approved_at: text(row.approved_at),
  };
}

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

type EvidenceRecord = { id: string; label: string; detail: string | null };

type FarmMember = {
  user_id: string;
  role: "owner" | "worker";
  employee_number: string | null;
};

function csvEscape(value: unknown) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
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
  const [farmChoices, setFarmChoices] = useState<H2aFarmChoice[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  const [housing, setHousing] = useState<Housing[]>([]);
  const [roles, setRoles] = useState<H2aRole[]>([]);
  const [farmMembers, setFarmMembers] = useState<FarmMember[]>([]);
  const [transportEvidence, setTransportEvidence] = useState<EvidenceRecord[]>([]);
  const [trainingEvidence, setTrainingEvidence] = useState<EvidenceRecord[]>([]);
  const [recruitmentEvidence, setRecruitmentEvidence] = useState<EvidenceRecord[]>([]);
  const [separationEvidence, setSeparationEvidence] = useState<EvidenceRecord[]>([]);
  const [message, setMessage] = useState("Loading H-2A records...");
  const [gps, setGps] = useState<{lat:number;lng:number;accuracy:number;capturedAt:string}|null>(null);
  const [offlinePending, setOfflinePending] = useState(0);

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
    shiftHours: "8",
    paidBreaks: "0",
    unpaidMeals: "0",
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

  function h2aCacheKey(userId: string, farmId: string) {
    return `farmvoice-h2a-cache:${userId}:${farmId}`;
  }

  function restoreCachedH2a(userId: string, farmId: string) {
    try {
      const cached = JSON.parse(localStorage.getItem(h2aCacheKey(userId, farmId)) ?? "null");
      if (!cached) return false;
      setContracts(cached.contracts ?? []);
      setWorkers(cached.workers ?? []);
      setDaily(cached.daily ?? []);
      setHousing(cached.housing ?? []);
      setRoles(cached.roles ?? []);
      setFarmMembers(cached.farmMembers ?? []);
      setTransportEvidence(cached.transportEvidence ?? []);
      setTrainingEvidence(cached.trainingEvidence ?? []);
      setRecruitmentEvidence(cached.recruitmentEvidence ?? []);
      setSeparationEvidence(cached.separationEvidence ?? []);
      return true;
    } catch {
      return false;
    }
  }

  async function load(preferredFarmId?: string) {
    try {
      const choices = await loadH2aFarmChoices(supabase);
      setFarmChoices(choices);
      const farm = preferredFarmId
        ? choices.find((choice) => choice.farmId === preferredFarmId) ?? null
        : pickH2aFarm(choices);
      if (!choices.length) {
        setMessage("Sign in and join a farm before using H-2A records.");
        return;
      }
      if (!farm) {
        setCtx(null);
        setMessage("Choose the farm whose H-2A records you want to manage.");
        return;
      }
      selectH2aFarm(farm.farmId);
      setCtx(farm);
      setOfflinePending(h2aDailyBatches(farm.userId, farm.farmId).length);

      if (!navigator.onLine) {
        const restored = restoreCachedH2a(farm.userId, farm.farmId);
        setMessage(
          restored
            ? "Offline mode: cached H-2A roster and records are available. New daily crew records will sync later."
            : "Reconnect once to cache this farm's H-2A roster before using it offline.",
        );
        return;
      }

      try {
        await withEvidenceSerialization(
          farm.farmId,
          farm.userId,
          () =>
            syncH2aDailyBatches(
              supabase,
              farm.userId,
              farm.farmId,
              remapQueuedEvidenceRecordIdWithinLock,
            ),
        );
      } catch (syncError) {
        setMessage(syncError instanceof Error ? syncError.message : "Some H-2A records are still waiting to sync.");
      }
      setOfflinePending(h2aDailyBatches(farm.userId, farm.farmId).length);

      const [c,w,d,h,r,m] = await Promise.all([
        supabase.from("h2a_contracts").select("id,name,eta_case_number,job_order_number,start_date,end_date,crop_or_commodity,expected_hours_per_day,expected_days_per_week,hourly_wage,active").eq("farm_id",farm.farmId).order("start_date",{ascending:false}),
        supabase.from("h2a_workers").select("id,contract_id,employee_number,legal_name,preferred_name,worker_type,preferred_language,arrival_date,work_authorization_end,status").eq("farm_id",farm.farmId).order("employee_number"),
        collectPages((from,to)=>supabase.from("h2a_daily_records").select("id,worker_id,work_date,crew_name,worksite,field_name,job,hours_offered,hours_worked,shift_minutes,paid_break_minutes,break_minutes,piece_unit,piece_quantity,submitted_at,locked_at,approved_at").eq("farm_id",farm.farmId).order("work_date",{ascending:false}).order("id").range(from,to)).then(data=>({data,error:null})),
        supabase.from("h2a_housing").select("id,name,address,max_occupancy,certificate_expires_on").eq("farm_id",farm.farmId).order("name"),
        supabase.from("h2a_user_roles").select("user_id,role").eq("farm_id",farm.farmId),
        supabase.from("farm_members").select("user_id,role,employee_number").eq("farm_id",farm.farmId),
      ]);
      for (const result of [c,w,d,h,r,m]) if (result.error) throw result.error;
      setContracts((c.data ?? []) as Contract[]);
      setWorkers((w.data ?? []) as Worker[]);
      setDaily((d.data ?? []) as DailyRecord[]);
      setHousing((h.data ?? []) as Housing[]);
      setRoles((r.data ?? []) as H2aRole[]);
      setFarmMembers((m.data ?? []) as FarmMember[]);
      const [transportRows, trainingRows, recruitmentRows, separationRows] = await Promise.all([
        supabase.from("h2a_transportation").select("id,travel_date,transport_type").eq("farm_id", farm.farmId).order("travel_date", { ascending: false }).limit(20),
        supabase.from("h2a_training").select("id,training_date,training_type").eq("farm_id", farm.farmId).order("training_date", { ascending: false }).limit(20),
        supabase.from("h2a_recruitment").select("id,applicant_name,contact_date").eq("farm_id", farm.farmId).order("created_at", { ascending: false }).limit(20),
        supabase.from("h2a_separations").select("id,separation_date,separation_type").eq("farm_id", farm.farmId).order("separation_date", { ascending: false }).limit(20),
      ]);
      for (const result of [transportRows, trainingRows, recruitmentRows, separationRows]) {
        if (result.error) throw result.error;
      }
      setTransportEvidence((transportRows.data ?? []).map((x) => ({ id: x.id, label: `${x.travel_date} · ${x.transport_type}`, detail: null })));
      setTrainingEvidence((trainingRows.data ?? []).map((x) => ({ id: x.id, label: `${x.training_date} · ${x.training_type}`, detail: null })));
      setRecruitmentEvidence((recruitmentRows.data ?? []).map((x) => ({ id: x.id, label: x.applicant_name || "Recruitment contact", detail: x.contact_date })));
      const nextTransport = (transportRows.data ?? []).map((x) => ({ id: x.id, label: `${x.travel_date} · ${x.transport_type}`, detail: null }));
      const nextTraining = (trainingRows.data ?? []).map((x) => ({ id: x.id, label: `${x.training_date} · ${x.training_type}`, detail: null }));
      const nextRecruitment = (recruitmentRows.data ?? []).map((x) => ({ id: x.id, label: x.applicant_name || "Recruitment contact", detail: x.contact_date }));
      const nextSeparation = (separationRows.data ?? []).map((x) => ({ id: x.id, label: `${x.separation_date} · ${x.separation_type}`, detail: null }));
      setTransportEvidence(nextTransport);
      setTrainingEvidence(nextTraining);
      setRecruitmentEvidence(nextRecruitment);
      setSeparationEvidence(nextSeparation);
      localStorage.setItem(h2aCacheKey(farm.userId, farm.farmId), JSON.stringify({
        contracts: c.data ?? [],
        workers: w.data ?? [],
        daily: d.data ?? [],
        housing: h.data ?? [],
        roles: r.data ?? [],
        farmMembers: m.data ?? [],
        transportEvidence: nextTransport,
        trainingEvidence: nextTraining,
        recruitmentEvidence: nextRecruitment,
        separationEvidence: nextSeparation,
      }));
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load H-2A records.");
    }
  }

  useEffect(() => {
    void load();
    const reconnect = () => void load(ctx?.farmId);
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [supabase, ctx?.farmId]);

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
    const duration = dailyHours(crewForm.shiftHours, crewForm.paidBreaks, crewForm.unpaidMeals);
    if (!duration) return setMessage("Enter a shift up to 24 hours and whole break minutes within the shift. Unpaid meals must be shorter than the shift.");
    const rows: H2aDailyRow[] = ids.map((workerId) => {
      const existing = daily.find(
        (row) => row.worker_id === workerId && row.work_date === crewForm.workDate,
      );
      return {
      id: existing?.id ?? crypto.randomUUID(),
      farm_id: ctx.farmId,
      contract_id: crewForm.contractId || workers.find((w) => w.id === workerId)?.contract_id || null,
      worker_id: workerId,
      work_date: crewForm.workDate,
      crew_name: crewForm.crewName.trim() || null,
      worksite: crewForm.worksite.trim() || null,
      field_name: crewForm.fieldName.trim() || null,
      job: crewForm.job.trim() || null,
      hours_offered: Number(crewForm.hoursOffered) || 0,
      hours_worked: duration.hours,
      shift_minutes: duration.shiftMinutes,
      paid_break_minutes: duration.paidBreakMinutes,
      break_minutes: duration.unpaidMealMinutes,
      piece_unit: crewForm.pieceUnit.trim() || null,
      piece_quantity: pieceCounts[workerId] ? Number(pieceCounts[workerId]) : null,
      gps_lat: gps?.lat ?? null,
      gps_lng: gps?.lng ?? null,
      gps_accuracy_m: gps?.accuracy ?? null,
      gps_captured_at: gps?.capturedAt ?? null,
      submitted_by: ctx.userId,
      crew_leader_attested_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
    };
    });
    if (!navigator.onLine) {
      storeH2aDailyBatch({
        id: crypto.randomUUID(),
        farmId: ctx.farmId,
        userId: ctx.userId,
        queuedAt: new Date().toISOString(),
        rows,
      });
      const localRows = rows.map((row) =>
        queuedDailyForDisplay({
          ...row,
          submitted_at: new Date().toISOString(),
          approved_at: null,
        }),
      );
      setDaily((current) => [...localRows, ...current.filter((x) => !localRows.some((y) => y.worker_id === x.worker_id && y.work_date === x.work_date))]);
      setOfflinePending(h2aDailyBatches(ctx.userId, ctx.farmId).length);
      setSelectedWorkers({});
      setPieceCounts({});
      setMessage(`Saved ${rows.length} H-2A crew record(s) on this device. They will sync when service returns.`);
      return;
    }

    try {
      await withEvidenceSerialization(
        ctx.farmId,
        ctx.userId,
        () =>
          saveH2aDailyRows(
            supabase,
            ctx.userId,
            ctx.farmId,
            rows,
            remapQueuedEvidenceRecordIdWithinLock,
          ),
      );
      setMessage(`Saved and locked ${rows.length} crew records. Later changes require a reason and remain auditable.`);
      setSelectedWorkers({});
      setPieceCounts({});
      void load();
    } catch (error) {
      if (isRetryableH2aSyncError(error)) {
        storeH2aDailyBatch({
          id: crypto.randomUUID(),
          farmId: ctx.farmId,
          userId: ctx.userId,
          queuedAt: new Date().toISOString(),
          rows,
        });
        setOfflinePending(h2aDailyBatches(ctx.userId, ctx.farmId).length);
        setSelectedWorkers({});
        setPieceCounts({});
        setDaily((current) => [
          ...rows.map((row) =>
            queuedDailyForDisplay({
              ...row,
              submitted_at: new Date().toISOString(),
              approved_at: null,
            }),
          ),
          ...current.filter(
            (x) => !rows.some((row) => row.worker_id === x.worker_id && row.work_date === x.work_date),
          ),
        ]);
        setMessage(`Connection was interrupted. Saved ${rows.length} crew record(s) on this device for automatic retry.`);
      } else {
        setMessage(error instanceof Error ? error.message : "H-2A crew records could not be saved.");
      }
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

  async function setH2aRole(userId: string, role: string) {
    if (!ctx || !isOwner) return;
    await supabase.from("h2a_user_roles").delete().eq("farm_id",ctx.farmId).eq("user_id",userId);
    if (role) {
      const { error } = await supabase.from("h2a_user_roles").insert({farm_id:ctx.farmId,user_id:userId,role});
      if (error) return setMessage(error.message);
    }
    setMessage(role ? "H-2A role assigned." : "H-2A role removed.");
    void load();
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
    if (!ctx) return;
    try {
      const [
        contractsR,
        workersR,
        dailyR,
        housingR,
        transportR,
        trainingR,
        recruitmentR,
        separationsR,
        arrivalChecklistR,
        readinessChecklistR,
        auditR,
      ] = await Promise.all([
        collectPages((from, to) =>
          supabase
            .from("h2a_contracts")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_workers")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_daily_records")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_housing")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_transportation")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_training")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_recruitment")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_separations")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_worker_arrival_checklist")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("worker_id")
            .order("item_key")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_farm_readiness_checklist")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("contract_id")
            .order("item_key")
            .range(from, to),
        ).then((data) => ({ data })),
        collectPages((from, to) =>
          supabase
            .from("h2a_audit_events")
            .select("*")
            .eq("farm_id", ctx.farmId)
            .order("changed_at")
            .order("id")
            .range(from, to),
        ).then((data) => ({ data })),
      ]);
      const sections: [string, unknown[]][] = [
        ["contracts", contractsR.data ?? []],
        ["workers", workersR.data ?? []],
        ["daily_records", dailyR.data ?? []],
        ["housing", housingR.data ?? []],
        ["transportation", transportR.data ?? []],
        ["training", trainingR.data ?? []],
        ["recruitment", recruitmentR.data ?? []],
        ["separations", separationsR.data ?? []],
        ["worker_arrival_checklist", arrivalChecklistR.data ?? []],
        ["farm_readiness_checklist", readinessChecklistR.data ?? []],
        ["audit_events", auditR.data ?? []],
      ];
      const rows: unknown[][] = [
        ["FarmVoice H-2A audit export"],
        ["Generated", new Date().toISOString()],
      ];
      for (const [name, items] of sections) {
        rows.push([], ["SECTION", name]);
        const objects = items as Record<string, unknown>[];
        const headers = [...new Set(objects.flatMap((o) => Object.keys(o)))];
        rows.push(headers);
        for (const o of objects)
          rows.push(
            headers.map((h) =>
              typeof o[h] === "object" ? JSON.stringify(o[h]) : o[h],
            ),
          );
      }
      downloadCsv("farmvoice-h2a-audit-export.csv", rows);
    } catch {
      setMessage(
        "Audit export failed. No partial report was downloaded. Reconnect and retry.",
      );
    }
  }

  const activeContract = contracts.find((c) => c.active);
  const guarantee =
    activeContract &&
    activeContract.expected_hours_per_day &&
    activeContract.expected_days_per_week
      ? Number(activeContract.expected_hours_per_day) *
        Number(activeContract.expected_days_per_week)
      : null;
  const offeredTotal = daily.reduce(
    (s, r) => s + Number(r.hours_offered || 0),
    0,
  );
  const workedTotal = daily.reduce(
    (s, r) => s + Number(r.hours_worked || 0),
    0,
  );

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">H-2A employer records</div>
        <h1 style={{fontSize:"clamp(36px,6vw,60px)"}}>Crew records without requiring worker phones</h1>
        <p className="lede">
          Contract records, worker roster, crew-leader daily time, hours offered, piecework, housing, transportation,
          training, incoming-worker checklists, farm readiness, recruitment, separation review, approvals and audit exports. FarmVoice prepares records for review;
          it does not determine legal compliance.
        </p>
        <div className="actions">
          <Link className="btn secondary" href="/h2a/arrival">Incoming worker checklist</Link>
          <Link className="btn secondary" href="/h2a/payroll">Payroll & guarantee review</Link>
          <Link className="btn secondary" href="/h2a/documents">Documents & acknowledgments</Link>
          <Link className="btn secondary" href="/h2a/housing">Housing compliance</Link>
        </div>
      </div>

      {message && <div className="notice">{message}</div>}

      {farmChoices.length > 1 && (
        <section className="card form">
          <div className="field">
            <label>Farm</label>
            <select
              value={ctx?.farmId ?? ""}
              onChange={(e) => {
                const farmId = e.target.value;
                if (!farmId) {
                  setCtx(null);
                  setMessage("Choose the farm whose H-2A records you want to manage.");
                  return;
                }
                selectH2aFarm(farmId);
                void load(farmId);
              }}
            >
              <option value="">Choose a farm</option>
              {farmChoices.map((farm) => <option key={farm.farmId} value={farm.farmId}>{farm.name}</option>)}
            </select>
          </div>
        </section>
      )}


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

      {isOwner && <section className="card stack">
        <div><div className="kicker">Permissions</div><h2>H-2A staff roles</h2><p className="muted">Assign existing FarmVoice users as H-2A administrators, crew leaders, payroll users, or housing managers.</p></div>
        <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>FarmVoice user</th><th>Team role</th><th>H-2A role</th></tr></thead><tbody>{farmMembers.map(m=>{const current=roles.find(r=>r.user_id===m.user_id)?.role??"";return <tr key={m.user_id}><td>{m.employee_number??m.user_id.slice(0,8)}</td><td>{m.role}</td><td><select value={current} onChange={e=>void setH2aRole(m.user_id,e.target.value)}><option value="">None</option><option value="h2a_admin">H-2A administrator</option><option value="crew_leader">Crew leader</option><option value="payroll">Payroll</option><option value="housing_manager">Housing manager</option></select></td></tr>})}</tbody></table></div>
      </section>}

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
        <div className="row"><div className="field"><label>Hours offered to selected workers</label><input inputMode="decimal" value={crewForm.hoursOffered} onChange={e=>setCrewForm({...crewForm,hoursOffered:e.target.value})}/></div><div className="field"><label htmlFor="h2a-shift-hours">Total shift hours, including breaks</label><input id="h2a-shift-hours" type="number" min="0.01" max="24" step="any" required value={crewForm.shiftHours} onChange={e=>setCrewForm({...crewForm,shiftHours:e.target.value})}/></div></div>
        <div className="row"><div className="field"><label htmlFor="h2a-paid-breaks">Paid rest breaks (minutes)</label><input id="h2a-paid-breaks" type="number" min="0" step="1" required value={crewForm.paidBreaks} onChange={e=>setCrewForm({...crewForm,paidBreaks:e.target.value})}/></div><div className="field"><label htmlFor="h2a-unpaid-meals">Actual unpaid meals (minutes)</label><input id="h2a-unpaid-meals" type="number" min="0" step="1" required value={crewForm.unpaidMeals} onChange={e=>setCrewForm({...crewForm,unpaidMeals:e.target.value})}/></div></div>
        <p className="small">Enter only meal time actually taken completely free of duties. Paid rest breaks remain in paid hours. No meal time is deducted by default. Submit separate entries for workers with different hours or breaks.</p>
        <p role="status"><strong>Calculated paid hours per selected worker: {dailyHours(crewForm.shiftHours,crewForm.paidBreaks,crewForm.unpaidMeals)?.hours.toFixed(2) ?? "Check hours and breaks"}</strong></p>
        <div className="field"><label>Piece unit (optional)</label><input placeholder="boxes, buckets, bins" value={crewForm.pieceUnit} onChange={e=>setCrewForm({...crewForm,pieceUnit:e.target.value})}/></div>
        <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Include</th><th>Worker</th><th>Employee #</th><th>Piece count</th></tr></thead><tbody>{workers.filter(w=>w.status!=="separated").map(w=><tr key={w.id}><td><input type="checkbox" checked={Boolean(selectedWorkers[w.id])} onChange={e=>setSelectedWorkers({...selectedWorkers,[w.id]:e.target.checked})}/></td><td>{w.preferred_name||w.legal_name}</td><td>{w.employee_number}</td><td><input style={{maxWidth:120}} inputMode="decimal" value={pieceCounts[w.id]??""} onChange={e=>setPieceCounts({...pieceCounts,[w.id]:e.target.value})}/></td></tr>)}</tbody></table></div>
        <label className="inline"><input type="checkbox" required/> I reviewed this crew record and confirm the attendance, hours offered, hours worked, and production entries are accurate to the best of my knowledge.</label>
        <button className="btn">Submit & lock crew records</button>
      </form>}

      <section className="card"><H2aWeeklyHours rows={daily} names={workerName}/></section>
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

      {ctx&&canAdmin&&<section className="card stack"><div><div className="kicker">Smart Photo Evidence</div><h2>Operational H-2A evidence</h2><p className="muted">Attach receipts, vehicle photos, training proof, recruitment records, and separation documentation directly to the saved record.</p></div><div className="grid-2"><div className="stack"><h3>Transportation</h3>{transportEvidence.map(x=><div className="card" key={x.id}><strong>{x.label}</strong><SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="transportation" recordId={x.id} category="transportation_evidence" onMessage={setMessage}/></div>)}<h3>Training</h3>{trainingEvidence.map(x=><div className="card" key={x.id}><strong>{x.label}</strong><SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="training" recordId={x.id} category="training_evidence" onMessage={setMessage}/></div>)}</div><div className="stack"><h3>Recruitment</h3>{recruitmentEvidence.map(x=><div className="card" key={x.id}><strong>{x.label}</strong>{x.detail&&<p className="small muted">{x.detail}</p>}<SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="recruitment" recordId={x.id} category="recruitment_evidence" onMessage={setMessage}/></div>)}<h3>Separations</h3>{separationEvidence.map(x=><div className="card" key={x.id}><strong>{x.label}</strong><SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="separation" recordId={x.id} category="separation_evidence" onMessage={setMessage}/></div>)}</div></div></section>}

      <section className="notice">
        <strong>Important:</strong> FarmVoice Records provides recordkeeping, workflow, calculation and document-management tools. It does not provide immigration, employment, legal, tax or regulatory advice and does not determine whether an employer is compliant with the H-2A program. Verify wage rates, hours, reimbursements, notices, filings, housing requirements and other obligations against the applicable job order, law and agency guidance before relying on or submitting FarmVoice-generated information.
      </section>
    <section className="card stack"><div><div className="kicker">Smart Photo Evidence</div><h2>Attach evidence to H-2A records</h2><p className="muted">Take a photo or choose an existing image/PDF. FarmVoice files it to the selected H-2A record automatically.</p></div>{ctx&&<div className="grid-2"><div className="stack"><h3>Workers</h3>{workers.slice(0,12).map(w=><div className="card" key={w.id}><strong>{w.employee_number} · {w.preferred_name||w.legal_name}</strong><SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="worker" recordId={w.id} category="worker_evidence" metadata={{employee_number:w.employee_number}} onMessage={setMessage}/></div>)}</div><div className="stack"><h3>Contracts</h3>{contracts.map(x=><div className="card" key={x.id}><strong>{x.name}</strong><SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="contract" recordId={x.id} category="contract_evidence" metadata={{contract_name:x.name}} onMessage={setMessage}/></div>)}<h3>Daily work records</h3>{daily.slice(0,12).map(x=><div className="card" key={x.id}><strong>{x.work_date} · {workerName.get(x.worker_id)||x.worker_id.slice(0,8)}</strong><SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="daily_record" recordId={x.id} category="work_evidence" gps={gps} metadata={{work_date:x.work_date,worker_id:x.worker_id}} onMessage={setMessage}/></div>)}</div></div>}</section></main>
  );
}
