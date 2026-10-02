"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SmartPhotoEvidence from "@/src/components/smart-photo-evidence";
import { createClient } from "@/src/lib/supabase/client";
import {
  loadH2aFarmChoices,
  pickH2aFarm,
  selectH2aFarm,
  type H2aFarmChoice,
} from "@/src/lib/h2a-farm-context";
import { type FarmContext } from "@/src/lib/farm-cloud";
import {
  CHECKLIST_VERSION,
  FARM_READINESS_CHECKLIST,
  WORKER_ARRIVAL_CHECKLIST,
  checklistProgress,
  suggestedDueOn,
  type ChecklistDefinition,
  type ChecklistStatus,
} from "@/src/lib/h2a-arrival-checklist";
import { collectPages } from "@/src/lib/pagination";

type Worker = {
  id: string;
  contract_id: string | null;
  employee_number: string;
  legal_name: string;
  preferred_name: string | null;
  preferred_language: string | null;
  worker_type: string;
  arrival_date: string | null;
  work_authorization_start: string | null;
  work_authorization_end: string | null;
  first_work_date: string | null;
  emergency_contact: string | null;
  status: string;
};

type Contract = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  job_order_number: string | null;
  eta_case_number: string | null;
  workers_comp_carrier: string | null;
  workers_comp_policy: string | null;
  workers_comp_expires_on: string | null;
  meal_arrangement: string | null;
  transportation_terms: string | null;
  active: boolean;
};

type ChecklistRow = {
  id: string;
  farm_id: string;
  worker_id?: string;
  contract_id: string | null;
  checklist_version: string;
  item_key: string;
  status: ChecklistStatus;
  due_on: string | null;
  completed_at: string | null;
  completed_by: string | null;
  exception_reason: string | null;
  evidence_reference: string | null;
  worker_acknowledged_at?: string | null;
  notes: string | null;
};

type H2aRole = { user_id: string; role: string };

type Draft = {
  status: ChecklistStatus;
  due_on: string;
  exception_reason: string;
  evidence_reference: string;
  worker_acknowledged: boolean;
  notes: string;
};

function groupDefinitions(definitions: ChecklistDefinition[]) {
  const groups = new Map<string, ChecklistDefinition[]>();
  for (const definition of definitions) {
    const rows = groups.get(definition.group) ?? [];
    rows.push(definition);
    groups.set(definition.group, rows);
  }
  return [...groups.entries()];
}

function draftFromRow(row: ChecklistRow): Draft {
  return {
    status: row.status,
    due_on: row.due_on ?? "",
    exception_reason: row.exception_reason ?? "",
    evidence_reference: row.evidence_reference ?? "",
    worker_acknowledged: Boolean(row.worker_acknowledged_at),
    notes: row.notes ?? "",
  };
}

export default function H2aArrivalChecklistPage() {
  const [supabase] = useState(() => createClient());
  const [ctx, setCtx] = useState<FarmContext | null>(null);
  const [farmChoices, setFarmChoices] = useState<H2aFarmChoice[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [roles, setRoles] = useState<H2aRole[]>([]);
  const [workerRows, setWorkerRows] = useState<ChecklistRow[]>([]);
  const [readinessRows, setReadinessRows] = useState<ChecklistRow[]>([]);
  const [workerId, setWorkerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState("Loading H-2A arrival checklists...");
  const [busy, setBusy] = useState(false);

  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? null;
  const selectedContract =
    contracts.find((contract) => contract.id === contractId) ??
    contracts.find((contract) => contract.id === selectedWorker?.contract_id) ??
    null;

  const canAdmin =
    ctx?.role === "owner" ||
    roles.some(
      (role) => role.user_id === ctx?.userId && role.role === "h2a_admin",
    );

  const workerProgress = checklistProgress(
    WORKER_ARRIVAL_CHECKLIST,
    workerRows.filter((row) => row.worker_id === workerId),
  );
  const readinessProgress = checklistProgress(
    FARM_READINESS_CHECKLIST,
    readinessRows.filter((row) => row.contract_id === contractId),
  );

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
        setMessage("Choose the farm whose H-2A arrival records you want to manage.");
        return;
      }
      selectH2aFarm(farm.farmId);
      setCtx(farm);

      const [workerResult, contractResult, roleResult, arrivalRows, readyRows] =
        await Promise.all([
          supabase
            .from("h2a_workers")
            .select(
              "id,contract_id,employee_number,legal_name,preferred_name,preferred_language,worker_type,arrival_date,work_authorization_start,work_authorization_end,first_work_date,emergency_contact,status",
            )
            .eq("farm_id", farm.farmId)
            .order("employee_number"),
          supabase
            .from("h2a_contracts")
            .select(
              "id,name,start_date,end_date,job_order_number,eta_case_number,workers_comp_carrier,workers_comp_policy,workers_comp_expires_on,meal_arrangement,transportation_terms,active",
            )
            .eq("farm_id", farm.farmId)
            .order("start_date", { ascending: false }),
          supabase
            .from("h2a_user_roles")
            .select("user_id,role")
            .eq("farm_id", farm.farmId),
          collectPages<ChecklistRow>((from, to) =>
            supabase
              .from("h2a_worker_arrival_checklist")
              .select(
                "id,farm_id,worker_id,contract_id,checklist_version,item_key,status,due_on,completed_at,completed_by,exception_reason,evidence_reference,worker_acknowledged_at,notes",
              )
              .eq("farm_id", farm.farmId)
              .eq("checklist_version", CHECKLIST_VERSION)
              .order("created_at")
              .range(from, to),
          ),
          collectPages<ChecklistRow>((from, to) =>
            supabase
              .from("h2a_farm_readiness_checklist")
              .select(
                "id,farm_id,contract_id,checklist_version,item_key,status,due_on,completed_at,completed_by,exception_reason,evidence_reference,notes",
              )
              .eq("farm_id", farm.farmId)
              .eq("checklist_version", CHECKLIST_VERSION)
              .order("created_at")
              .range(from, to),
          ),
        ]);

      for (const result of [workerResult, contractResult, roleResult]) {
        if (result.error) throw result.error;
      }

      const nextWorkers = (workerResult.data ?? []) as Worker[];
      const nextContracts = (contractResult.data ?? []) as Contract[];
      const nextRoles = (roleResult.data ?? []) as H2aRole[];
      setWorkers(nextWorkers);
      setContracts(nextContracts);
      setRoles(nextRoles);
      setWorkerRows(arrivalRows);
      setReadinessRows(readyRows);

      const nextWorker =
        nextWorkers.find((worker) => worker.id === workerId) ??
        nextWorkers.find(
          (worker) => worker.worker_type === "h2a" && worker.status === "expected",
        ) ??
        nextWorkers.find(
          (worker) => worker.worker_type === "h2a" && worker.status === "active",
        ) ??
        nextWorkers[0] ??
        null;
      const nextContract =
        nextContracts.find((contract) => contract.id === contractId) ??
        nextContracts.find((contract) => contract.id === nextWorker?.contract_id) ??
        nextContracts.find((contract) => contract.active) ??
        nextContracts[0] ??
        null;

      setWorkerId(nextWorker?.id ?? "");
      setContractId(nextContract?.id ?? "");
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load H-2A arrival checklists.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, [supabase]);

  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const row of [...workerRows, ...readinessRows])
      next[row.id] = draftFromRow(row);
    setDrafts(next);
  }, [workerRows, readinessRows]);

  async function ensureWorkerChecklist() {
    if (!ctx || !selectedWorker || !canAdmin) return;
    const existing = new Set(
      workerRows
        .filter((row) => row.worker_id === selectedWorker.id)
        .map((row) => row.item_key),
    );
    const missing = WORKER_ARRIVAL_CHECKLIST.filter(
      (definition) => !existing.has(definition.key),
    );
    if (!missing.length) return;

    const contract =
      contracts.find((item) => item.id === selectedWorker.contract_id) ?? null;
    const context = {
      arrivalDate: selectedWorker.arrival_date,
      firstWorkDate: selectedWorker.first_work_date,
      contractStart: contract?.start_date,
      contractEnd: contract?.end_date,
    };
    const { error } = await supabase.from("h2a_worker_arrival_checklist").insert(
      missing.map((definition) => ({
        farm_id: ctx.farmId,
        worker_id: selectedWorker.id,
        contract_id: selectedWorker.contract_id,
        checklist_version: CHECKLIST_VERSION,
        item_key: definition.key,
        status: definition.defaultStatus,
        due_on: suggestedDueOn(definition, context),
        created_by: ctx.userId,
      })),
    );
    if (error) throw error;
  }

  async function ensureReadinessChecklist() {
    if (!ctx || !selectedContract || !canAdmin) return;
    const existing = new Set(
      readinessRows
        .filter((row) => row.contract_id === selectedContract.id)
        .map((row) => row.item_key),
    );
    const missing = FARM_READINESS_CHECKLIST.filter(
      (definition) => !existing.has(definition.key),
    );
    if (!missing.length) return;
    const { error } = await supabase.from("h2a_farm_readiness_checklist").insert(
      missing.map((definition) => ({
        farm_id: ctx.farmId,
        contract_id: selectedContract.id,
        checklist_version: CHECKLIST_VERSION,
        item_key: definition.key,
        status: definition.defaultStatus,
        created_by: ctx.userId,
      })),
    );
    if (error) throw error;
  }

  useEffect(() => {
    if (!ctx || !canAdmin || !workerId) return;
    void (async () => {
      try {
        await ensureWorkerChecklist();
        await load(ctx.farmId);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to initialize checklist.",
        );
      }
    })();
  }, [workerId, ctx?.farmId, canAdmin]);

  useEffect(() => {
    if (!ctx || !canAdmin || !contractId) return;
    void (async () => {
      try {
        await ensureReadinessChecklist();
        await load(ctx.farmId);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to initialize readiness checklist.",
        );
      }
    })();
  }, [contractId, ctx?.farmId, canAdmin]);

  async function saveArrivalFacts() {
    if (!ctx || !selectedWorker || !canAdmin) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("h2a_workers")
        .update({
          arrival_date: selectedWorker.arrival_date,
          first_work_date: selectedWorker.first_work_date,
          work_authorization_start: selectedWorker.work_authorization_start,
          work_authorization_end: selectedWorker.work_authorization_end,
          preferred_language: selectedWorker.preferred_language,
          emergency_contact: selectedWorker.emergency_contact,
        })
        .eq("id", selectedWorker.id)
        .eq("farm_id", ctx.farmId);
      if (error) throw error;

      const contract =
        contracts.find((item) => item.id === selectedWorker.contract_id) ?? null;
      const context = {
        arrivalDate: selectedWorker.arrival_date,
        firstWorkDate: selectedWorker.first_work_date,
        contractStart: contract?.start_date,
        contractEnd: contract?.end_date,
      };
      const rows = workerRows.filter(
        (row) =>
          row.worker_id === selectedWorker.id &&
          row.status !== "complete" &&
          row.status !== "exception",
      );
      for (const row of rows) {
        const definition = WORKER_ARRIVAL_CHECKLIST.find(
          (item) => item.key === row.item_key,
        );
        if (!definition) continue;
        const dueOn = suggestedDueOn(definition, context);
        if (dueOn === row.due_on) continue;
        const result = await supabase
          .from("h2a_worker_arrival_checklist")
          .update({ due_on: dueOn, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("farm_id", ctx.farmId);
        if (result.error) throw result.error;
      }

      setMessage("Worker arrival facts and suggested deadlines saved.");
      await load(ctx.farmId);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save worker arrival facts.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateWorkerLocal(patch: Partial<Worker>) {
    if (!selectedWorker) return;
    setWorkers((current) =>
      current.map((worker) =>
        worker.id === selectedWorker.id ? { ...worker, ...patch } : worker,
      ),
    );
  }

  async function saveChecklistRow(
    table:
      | "h2a_worker_arrival_checklist"
      | "h2a_farm_readiness_checklist",
    row: ChecklistRow,
  ) {
    if (!ctx || !canAdmin) return;
    const draft = drafts[row.id] ?? draftFromRow(row);
    if (draft.status === "exception" && !draft.exception_reason.trim()) {
      setMessage("Enter an exception / not-applicable reason before saving.");
      return;
    }
    setBusy(true);
    const completed =
      draft.status === "complete" || draft.status === "exception";
    const update: Record<string, unknown> = {
      status: draft.status,
      due_on: draft.due_on || null,
      exception_reason:
        draft.status === "exception" ? draft.exception_reason.trim() : null,
      evidence_reference: draft.evidence_reference.trim() || null,
      notes: draft.notes.trim() || null,
      completed_at: completed ? row.completed_at ?? new Date().toISOString() : null,
      completed_by: completed ? ctx.userId : null,
      updated_at: new Date().toISOString(),
    };
    if (table === "h2a_worker_arrival_checklist") {
      update.worker_acknowledged_at = draft.worker_acknowledged
        ? row.worker_acknowledged_at ?? new Date().toISOString()
        : null;
    }
    const { error } = await supabase
      .from(table)
      .update(update)
      .eq("id", row.id)
      .eq("farm_id", ctx.farmId);
    setBusy(false);
    setMessage(error ? error.message : "Checklist item saved.");
    if (!error) void load(ctx.farmId);
  }

  function renderChecklistItem(
    definition: ChecklistDefinition,
    row: ChecklistRow | undefined,
    table:
      | "h2a_worker_arrival_checklist"
      | "h2a_farm_readiness_checklist",
  ) {
    if (!row || !ctx) return null;
    const draft = drafts[row.id] ?? draftFromRow(row);
    return (
      <article className="card stack" key={definition.key}>
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{definition.title}</strong>
            <p className="small muted">{definition.description}</p>
          </div>
          <span className="badge">{draft.status.replaceAll("_", " ")}</span>
        </div>

        <div className="grid-3">
          <div className="field">
            <label htmlFor={`status-${row.id}`}>Status</label>
            <select
              id={`status-${row.id}`}
              value={draft.status}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [row.id]: {
                    ...draft,
                    status: event.target.value as ChecklistStatus,
                  },
                }))
              }
            >
              <option value="required_now">Required now</option>
              <option value="due_later">Due later</option>
              <option value="complete">Complete</option>
              <option value="exception">Exception / not applicable</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`due-${row.id}`}>Due date</label>
            <input
              id={`due-${row.id}`}
              type="date"
              value={draft.due_on}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [row.id]: { ...draft, due_on: event.target.value },
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor={`evidence-${row.id}`}>Evidence reference</label>
            <input
              id={`evidence-${row.id}`}
              value={draft.evidence_reference}
              placeholder="Receipt, document ID, file note…"
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [row.id]: {
                    ...draft,
                    evidence_reference: event.target.value,
                  },
                }))
              }
            />
          </div>
        </div>

        {draft.status === "exception" && (
          <div className="field">
            <label htmlFor={`exception-${row.id}`}>
              Exception / not-applicable reason
            </label>
            <textarea
              id={`exception-${row.id}`}
              required
              value={draft.exception_reason}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [row.id]: {
                    ...draft,
                    exception_reason: event.target.value,
                  },
                }))
              }
            />
          </div>
        )}

        {table === "h2a_worker_arrival_checklist" && (
          <label className="inline">
            <input
              type="checkbox"
              checked={draft.worker_acknowledged}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [row.id]: {
                    ...draft,
                    worker_acknowledged: event.target.checked,
                  },
                }))
              }
            />
            Worker acknowledgment recorded for this item, when applicable
          </label>
        )}

        <div className="field">
          <label htmlFor={`notes-${row.id}`}>Notes</label>
          <textarea
            id={`notes-${row.id}`}
            value={draft.notes}
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [row.id]: { ...draft, notes: event.target.value },
              }))
            }
          />
        </div>

        <div className="inline">
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void saveChecklistRow(table, row)}
          >
            Save item
          </button>
          <a
            className="btn secondary"
            href={definition.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {definition.sourceLabel}
          </a>
        </div>

        <SmartPhotoEvidence
          farmId={ctx.farmId}
          userId={ctx.userId}
          module="h2a"
          recordType={
            table === "h2a_worker_arrival_checklist"
              ? "arrival_checklist"
              : "readiness_checklist"
          }
          recordId={row.id}
          category="h2a_checklist_evidence"
          metadata={{
            item_key: definition.key,
            checklist_version: CHECKLIST_VERSION,
          }}
          onMessage={setMessage}
        />
      </article>
    );
  }

  const workerChecklistRows = workerRows.filter((row) => row.worker_id === workerId);
  const readinessChecklistRows = readinessRows.filter(
    (row) => row.contract_id === contractId,
  );

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">H-2A arrival controls</div>
        <h1>Incoming Worker & Farm Readiness Checklist</h1>
        <p className="lede">
          Track arrival/onboarding tasks, due dates, exceptions, acknowledgments
          and supporting evidence. FarmVoice references federal guidance but does
          not replace Form I-9, the certified job order, agency forms, or legal review.
        </p>
        <div className="actions">
          <Link className="btn secondary" href="/h2a">
            Back to H-2A dashboard
          </Link>
          <Link className="btn secondary" href="/h2a/documents">
            Documents & acknowledgments
          </Link>
          <Link className="btn secondary" href="/h2a/housing">
            Housing
          </Link>
        </div>
      </div>

      {message && <div className="notice" role="status">{message}</div>}

      {farmChoices.length > 1 && (
        <section className="card form">
          <div className="field">
            <label htmlFor="arrival-farm">Farm</label>
            <select
              id="arrival-farm"
              value={ctx?.farmId ?? ""}
              onChange={(event) => {
                const next = event.target.value;
                if (!next) return;
                selectH2aFarm(next);
                void load(next);
              }}
            >
              <option value="">Choose a farm</option>
              {farmChoices.map((farm) => (
                <option key={farm.farmId} value={farm.farmId}>
                  {farm.name}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {ctx && !canAdmin && (
        <div className="notice">
          H-2A owner or H-2A administrator access is required for arrival
          checklists because these records may contain sensitive onboarding information.
        </div>
      )}

      {ctx && canAdmin && (
        <>
          <section className="grid-2">
            <div className="card form">
              <div>
                <div className="kicker">Incoming worker</div>
                <h2>Worker checklist</h2>
              </div>
              <div className="field">
                <label htmlFor="arrival-worker">Worker</label>
                <select
                  id="arrival-worker"
                  value={workerId}
                  onChange={(event) => {
                    setWorkerId(event.target.value);
                    const worker = workers.find(
                      (item) => item.id === event.target.value,
                    );
                    if (worker?.contract_id) setContractId(worker.contract_id);
                  }}
                >
                  <option value="">Choose worker</option>
                  {workers.filter((worker) => worker.worker_type === "h2a").map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.employee_number} ·{" "}
                      {worker.preferred_name || worker.legal_name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedWorker && (
                <>
                  <div className="notice">
                    <strong>
                      {workerProgress.complete} of {workerProgress.total} arrival
                      items complete / excepted
                    </strong>
                    <div>{workerProgress.percent}% reviewed</div>
                    <div className="small muted">
                      {workerProgress.attention} item(s) still require attention
                    </div>
                  </div>
                  <div className="progress-bar" aria-label="Worker checklist progress">
                    <span style={{ width: `${workerProgress.percent}%` }} />
                  </div>
                </>
              )}
            </div>

            <div className="card form">
              <div>
                <div className="kicker">Farm readiness</div>
                <h2>Contract checklist</h2>
              </div>
              <div className="field">
                <label htmlFor="arrival-contract">Job order / contract</label>
                <select
                  id="arrival-contract"
                  value={contractId}
                  onChange={(event) => setContractId(event.target.value)}
                >
                  <option value="">Choose contract</option>
                  {contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedContract && (
                <>
                  <div className="notice">
                    <strong>
                      {readinessProgress.complete} of {readinessProgress.total} farm
                      readiness items complete / excepted
                    </strong>
                    <div>{readinessProgress.percent}% reviewed</div>
                    <div className="small muted">
                      {selectedContract.job_order_number
                        ? `Job order ${selectedContract.job_order_number}`
                        : "Job-order number not recorded"}
                    </div>
                  </div>
                  <div className="progress-bar" aria-label="Readiness checklist progress">
                    <span style={{ width: `${readinessProgress.percent}%` }} />
                  </div>
                </>
              )}
            </div>
          </section>

          {selectedWorker && (
            <section className="card form">
              <div>
                <div className="kicker">Worker facts</div>
                <h2>Arrival & employment dates</h2>
                <p className="muted">
                  These dates drive checklist deadlines. Form I-9 remains the
                  official employment-verification record.
                </p>
              </div>
              <div className="grid-3">
                <div className="field">
                  <label htmlFor="arrival-date">Arrival date</label>
                  <input
                    id="arrival-date"
                    type="date"
                    value={selectedWorker.arrival_date ?? ""}
                    onChange={(event) =>
                      updateWorkerLocal({ arrival_date: event.target.value || null })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="first-work-date">First work date</label>
                  <input
                    id="first-work-date"
                    type="date"
                    value={selectedWorker.first_work_date ?? ""}
                    onChange={(event) =>
                      updateWorkerLocal({
                        first_work_date: event.target.value || null,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="worker-language">Preferred language</label>
                  <input
                    id="worker-language"
                    value={selectedWorker.preferred_language ?? ""}
                    onChange={(event) =>
                      updateWorkerLocal({
                        preferred_language: event.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid-3">
                <div className="field">
                  <label htmlFor="auth-start">Work authorization start</label>
                  <input
                    id="auth-start"
                    type="date"
                    value={selectedWorker.work_authorization_start ?? ""}
                    onChange={(event) =>
                      updateWorkerLocal({
                        work_authorization_start: event.target.value || null,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-end">Work authorization end</label>
                  <input
                    id="auth-end"
                    type="date"
                    value={selectedWorker.work_authorization_end ?? ""}
                    onChange={(event) =>
                      updateWorkerLocal({
                        work_authorization_end: event.target.value || null,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="emergency-contact">Emergency contact</label>
                  <input
                    id="emergency-contact"
                    value={selectedWorker.emergency_contact ?? ""}
                    onChange={(event) =>
                      updateWorkerLocal({
                        emergency_contact: event.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void saveArrivalFacts()}
              >
                Save worker facts
              </button>
            </section>
          )}

          {selectedWorker && (
            <section className="stack">
              <div>
                <div className="kicker">Worker arrival checklist</div>
                <h2>
                  {selectedWorker.employee_number} ·{" "}
                  {selectedWorker.preferred_name || selectedWorker.legal_name}
                </h2>
              </div>
              {groupDefinitions(WORKER_ARRIVAL_CHECKLIST).map(
                ([group, definitions]) => (
                  <section className="stack" key={group}>
                    <h3>{group}</h3>
                    <div className="grid-2">
                      {definitions.map((definition) =>
                        renderChecklistItem(
                          definition,
                          workerChecklistRows.find(
                            (row) => row.item_key === definition.key,
                          ),
                          "h2a_worker_arrival_checklist",
                        ),
                      )}
                    </div>
                  </section>
                ),
              )}
            </section>
          )}

          {selectedContract && (
            <section className="stack">
              <div>
                <div className="kicker">Farm readiness checklist</div>
                <h2>{selectedContract.name}</h2>
                <p className="muted">
                  Farm-level readiness items apply to the job order rather than
                  one individual worker.
                </p>
              </div>
              {groupDefinitions(FARM_READINESS_CHECKLIST).map(
                ([group, definitions]) => (
                  <section className="stack" key={group}>
                    <h3>{group}</h3>
                    <div className="grid-2">
                      {definitions.map((definition) =>
                        renderChecklistItem(
                          definition,
                          readinessChecklistRows.find(
                            (row) => row.item_key === definition.key,
                          ),
                          "h2a_farm_readiness_checklist",
                        ),
                      )}
                    </div>
                  </section>
                ),
              )}
            </section>
          )}
        </>
      )}

      <section className="notice">
        <strong>Important:</strong> This checklist is a recordkeeping and workflow
        aid. Completing it does not by itself establish H-2A, immigration,
        employment, tax, housing, transportation, payroll, or other legal
        compliance. Keep and complete the actual required federal/state forms,
        certified job order, housing records, payroll records and supporting
        documentation.
      </section>
    </main>
  );
}
