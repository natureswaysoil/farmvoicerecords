"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getNamedFarmContexts, type FarmContext } from "@/src/lib/farm-cloud";
import { collectPages, csvCell, hoursBetween } from "@/src/lib/pagination";
import {
  crewBatches,
  storeCrewBatch,
  removeCrewBatch,
  crewBackup,
  type CrewBatch,
} from "@/src/lib/crew/offline";
type Worker = {
  id: string;
  name: string;
  employee_number: string;
  active: boolean;
};
type Entry = {
  id: string;
  worker_id: string;
  clock_in: string;
  clock_out: string;
  break_minutes: number;
  job: string;
  field_name: string;
  approval_status: string;
  entered_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
};
function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function CrewPage() {
  const [db] = useState(createClient),
    [es, setEs] = useState(false),
    [contexts, setContexts] = useState<FarmContext[]>([]),
    [farmId, setFarmId] = useState("");
  const ctx = contexts.find((f) => f.farmId === farmId);
  const t = (en: string, sp: string) => (es ? sp : en);
  const [workers, setWorkers] = useState<Worker[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [entries, setEntries] = useState<Entry[]>([]),
    [pending, setPending] = useState<CrewBatch[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reload, setReload] = useState(0);
  const [roster, setRoster] = useState({ name: "", number: "" }),
    [members, setMembers] = useState<
      { user_id: string; employee_number: string | null }[]
    >([]),
    [leaders, setLeaders] = useState<string[]>([]),
    [leader, setLeader] = useState("");
  const [form, setForm] = useState({
      start: "",
      end: "",
      breaks: "0",
      job: "",
      field: "",
    }),
    [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [period, setPeriod] = useState({
    start: new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });
  const [zone, setZone] = useState("UTC"),
    [limit, setLimit] = useState(100);
  useEffect(() => {
    setEs(localStorage.getItem("farmvoice-language") === "es");
  }, []);
  const syncing = useRef(false);
  const batchAttempt = useRef<CrewBatch | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await db.auth.getSession();
        if (!data.session?.user) return;
        const user = data.session.user;
        const key = `farmvoice-contexts:${user.id}`;
        const farms = navigator.onLine
          ? await getNamedFarmContexts(db)
          : JSON.parse(localStorage.getItem(key) ?? "[]");
        if (navigator.onLine) localStorage.setItem(key, JSON.stringify(farms));
        if (active) {
          setContexts(farms);
          const last = localStorage.getItem("farmvoice_selected_farm_id");
          setFarmId(
            farms.find((f: FarmContext) => f.farmId === last)?.farmId ??
              farms[0]?.farmId ??
              "",
          );
        }
      } catch {
        if (active) setMessage("Reconnect to load your farms.");
      }
    })();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setContexts([]);
        setWorkers([]);
        setEntries([]);
        setPending([]);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [db]);
  useEffect(() => {
    setSelected([]);
    setGps(null);
    setForm({ start: "", end: "", breaks: "0", job: "", field: "" });
    batchAttempt.current = null;
  }, [farmId]);
  useEffect(() => {
    setWorkers([]);
    setEntries([]);
    setMembers([]);
    setLeaders([]);
    if (!ctx) return;
    let active = true;
    const current = ctx;
    setPending(crewBatches(current.userId, current.farmId));
    const key = `farmvoice-crew-roster:${current.userId}:${current.farmId}`;
    void (async () => {
      try {
        if (!navigator.onLine) {
          const cached = JSON.parse(localStorage.getItem(key) ?? "[]");
          if (active) setWorkers(cached);
          return;
        }
        const [roster, time, farm, m, l] = await Promise.all([
          collectPages<Worker>((a, b) =>
            db
              .from("crew_workers")
              .select("*")
              .eq("farm_id", current.farmId)
              .order("employee_number")
              .order("id")
              .range(a, b),
          ),
          db
            .from("crew_time_entries")
            .select("*")
            .eq("farm_id", current.farmId)
            .order("clock_in", { ascending: false })
            .order("id")
            .limit(limit),
          db.from("farms").select("timezone").eq("id", current.farmId).single(),
          current.role === "owner"
            ? db
                .from("farm_members")
                .select("user_id,employee_number")
                .eq("farm_id", current.farmId)
                .eq("role", "worker")
            : Promise.resolve({ data: [], error: null }),
          db
            .from("crew_leaders")
            .select("user_id")
            .eq("farm_id", current.farmId),
        ]);
        if (time.error || farm.error || m.error || l.error)
          throw new Error(
            "Crew records are unavailable. Check your access or ask the farm owner.",
          );
        if (active) {
          setWorkers(roster);
          setEntries(time.data ?? []);
          setMembers(m.data ?? []);
          setLeaders((l.data ?? []).map((x) => x.user_id));
          setZone(farm.data.timezone ?? "UTC");
          localStorage.setItem(key, JSON.stringify(roster));
        }
      } catch (e) {
        if (active)
          setMessage(
            e instanceof Error ? e.message : "Could not load crew records.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [ctx, db, reload, limit]);
  async function sync() {
    if (!ctx || syncing.current || !navigator.onLine) return;
    syncing.current = true;
    setBusy(true);
    const current = ctx;
    let sent = 0;
    const failures: string[] = [];
    try {
      for (const batch of crewBatches(current.userId, current.farmId)) {
        try {
          const { error } = await db.rpc("submit_crew_time", {
            p_farm_id: current.farmId,
            p_entries: batch.entries,
          });
          if (error) throw new Error(error.message);
          removeCrewBatch(batch);
          sent += batch.entries.length;
        } catch (error) {
          failures.push(
            error instanceof Error
              ? error.message
              : "Could not deliver this batch. Retry when online.",
          );
        }
      }
      setPending(crewBatches(current.userId, current.farmId));
      setReload((n) => n + 1);
      setMessage(
        failures.length
          ? `${sent} ${t("entries delivered. Still pending:", "registros enviados. Pendiente:")} ${failures.join("; ")}`
          : t(
              `${sent} entries delivered for owner review.`,
              `${sent} registros enviados para revisión.`,
            ),
      );
    } finally {
      syncing.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const online = () => {
      void sync();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [ctx, db]);
  async function submit() {
    if (!ctx || busy) return;
    const start = new Date(form.start),
      end = new Date(form.end),
      breaks = Number(form.breaks);
    if (
      !selected.length ||
      !form.start ||
      !form.end ||
      !form.job.trim() ||
      !Number.isInteger(breaks) ||
      breaks < 0 ||
      end <= start ||
      end.getTime() - start.getTime() > 86400000 ||
      hoursBetween(start.toISOString(), end.toISOString(), breaks) <= 0
    ) {
      setMessage(
        t(
          "Choose workers, a job, valid times within 24 hours and unpaid break minutes.",
          "Seleccione trabajadores, trabajo, horas válidas dentro de 24 horas y minutos de descanso no pagado.",
        ),
      );
      return;
    }
    try {
      // Retain the same batch if saving to browser storage fails and the user retries.
      if (!batchAttempt.current)
        batchAttempt.current = {
          id: crypto.randomUUID(),
          userId: ctx.userId,
          farmId,
          createdAt: new Date().toISOString(),
          entries: selected.map((worker_id) => ({
            id: crypto.randomUUID(),
            worker_id,
            clock_in: start.toISOString(),
            clock_out: end.toISOString(),
            break_minutes: breaks,
            job: form.job.trim(),
            field_name: form.field.trim(),
            supervisor_lat: gps?.lat ?? null,
            supervisor_lng: gps?.lng ?? null,
          })),
        };
      storeCrewBatch(batchAttempt.current);
      setPending(crewBatches(ctx.userId, farmId));
      setSelected([]);
      batchAttempt.current = null;
      setMessage(
        t(
          "Saved on this device. Reopen online and choose Send pending crew records. Do not clear browser data.",
          "Guardado en el dispositivo. Abra con conexión y seleccione Enviar registros pendientes. No borre los datos del navegador.",
        ),
      );
      if (navigator.onLine) await sync();
    } catch {
      setMessage(
        t(
          "Could not save. Keep this page open and retry.",
          "No se pudo guardar. Mantenga la página abierta y reintente.",
        ),
      );
    }
  }
  async function addWorker() {
    if (!ctx) return;
    setBusy(true);
    const { error } = await db.from("crew_workers").insert({
      farm_id: farmId,
      name: roster.name.trim(),
      employee_number: roster.number.trim(),
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setRoster({ name: "", number: "" });
      setReload((n) => n + 1);
    }
  }
  async function assignLeader(remove = false, id = leader) {
    if (!ctx || !id) return;
    setBusy(true);
    const result = remove
      ? await db
          .from("crew_leaders")
          .delete()
          .eq("farm_id", farmId)
          .eq("user_id", id)
      : await db.from("crew_leaders").insert({ farm_id: farmId, user_id: id });
    setBusy(false);
    setMessage(
      result.error
        ? result.error.message
        : t("Crew access updated.", "Acceso actualizado."),
    );
    setReload((n) => n + 1);
  }
  async function review(entry: Entry, status: string) {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = window.prompt(
        t("Why is this entry rejected?", "¿Por qué se rechaza este registro?"),
      );
      if (!reason || reason.trim().length < 5) return;
    }
    setBusy(true);
    const { error } = await db
      .from("crew_time_entries")
      .update({ approval_status: status, review_reason: reason })
      .eq("farm_id", farmId)
      .eq("id", entry.id)
      .eq("approval_status", entry.approval_status)
      .select("id")
      .single();
    setBusy(false);
    setMessage(
      error ? error.message : t("Review saved.", "Revisión guardada."),
    );
    setReload((n) => n + 1);
  }
  async function exportCsv() {
    if (!ctx || !period.start || period.end < period.start) return;
    setBusy(true);
    try {
      const rows = await collectPages<Entry>((a, b) =>
        db
          .from("crew_time_entries")
          .select("*")
          .eq("farm_id", farmId)
          .eq("approval_status", "approved")
          .gte(
            "clock_in",
            new Date(Date.parse(period.start) - 86400000).toISOString(),
          )
          .lt(
            "clock_in",
            new Date(Date.parse(period.end) + 2 * 86400000).toISOString(),
          )
          .order("clock_in")
          .order("id")
          .range(a, b),
      );
      const day = (v: string) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(v));
      const selected = rows.filter(
        (r) => day(r.clock_in) >= period.start && day(r.clock_in) <= period.end,
      );
      const total = selected.reduce(
        (n, r) => n + hoursBetween(r.clock_in, r.clock_out, r.break_minutes),
        0,
      );
      download(
        `crew-time-${period.start}-${period.end}.csv`,
        [
          [
            "employee",
            "name",
            "start_utc",
            "end_utc",
            "unpaid_break_minutes",
            "hours",
            "job",
            "field",
            "entered_by",
            "reviewed_by",
            "timezone",
          ],
          ...selected.map((r) => {
            const w = workers.find((x) => x.id === r.worker_id);
            return [
              w?.employee_number ?? r.worker_id,
              w?.name,
              r.clock_in,
              r.clock_out,
              r.break_minutes,
              hoursBetween(r.clock_in, r.clock_out, r.break_minutes).toFixed(4),
              r.job,
              r.field_name,
              r.entered_by,
              r.reviewed_by,
              zone,
            ];
          }),
          ["TOTAL", "", "", "", "", total.toFixed(4)],
        ]
          .map((r) => r.map(csvCell).join(","))
          .join("\n"),
      );
      setMessage(
        `${selected.length} ${t("entries exported", "registros exportados")} · ${total.toFixed(2)} ${t("hours", "horas")}`,
      );
    } catch {
      setMessage(
        t(
          "Export failed; no partial file was downloaded.",
          "Falló la exportación; no se descargó un archivo parcial.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const canEnter =
    ctx?.role === "owner" ||
    leaders.includes(ctx?.userId ?? "") ||
    (typeof navigator !== "undefined" &&
      !navigator.onLine &&
      workers.length > 0);
  return (
    <main className="container section stack" lang={es ? "es" : "en"}>
      <div className="inline">
        <h1>{t("One-phone crew records", "Registros de cuadrilla")}</h1>
        <button
          onClick={() => {
            localStorage.setItem("farmvoice-language", es ? "en" : "es");
            setEs(!es);
          }}
        >
          {es ? "English" : "Español"}
        </button>
      </div>
      <p>
        {t(
          "Record a crew day on one supervisor's device. No worker phones or accounts needed. Included in Core. Owner review is required before export.",
          "Registre el día desde el dispositivo del supervisor. Los trabajadores no necesitan teléfono ni cuenta. Incluido en Core. El propietario revisa antes de exportar.",
        )}
      </p>
      <Link href="/team">
        {t("Individual time clocks", "Relojes individuales")}
      </Link>
      <p role="status">{message}</p>
      {!ctx ? (
        <Link href="/login?next=/team/crew">
          {t("Sign in to your farm", "Inicie sesión")}
        </Link>
      ) : (
        <>
          <label>
            {t("Farm", "Finca")}
            <select
              value={farmId}
              disabled={busy}
              onChange={(e) => {
                setFarmId(e.target.value);
                localStorage.setItem(
                  "farmvoice_selected_farm_id",
                  e.target.value,
                );
              }}
            >
              {contexts.map((f) => (
                <option key={f.farmId} value={f.farmId}>
                  {f.farmName ?? f.farmId}
                </option>
              ))}
            </select>
          </label>
          {ctx.role === "owner" && (
            <details className="card">
              <summary>
                {t(
                  "Manage roster and supervisors",
                  "Administrar trabajadores y supervisores",
                )}
              </summary>
              <div className="form">
                <label>
                  {t("Worker name", "Nombre")}
                  <input
                    value={roster.name}
                    onChange={(e) =>
                      setRoster({ ...roster, name: e.target.value })
                    }
                    maxLength={160}
                  />
                </label>
                <label>
                  {t("Employee number", "Número de empleado")}
                  <input
                    value={roster.number}
                    onChange={(e) =>
                      setRoster({ ...roster, number: e.target.value })
                    }
                    maxLength={40}
                  />
                </label>
                <button
                  disabled={
                    busy || !roster.name.trim() || !roster.number.trim()
                  }
                  onClick={() => void addWorker()}
                >
                  {t(
                    "Add worker without a login",
                    "Agregar trabajador sin cuenta",
                  )}
                </button>
                <label>
                  {t(
                    "Authorize a signed-in farm member as supervisor",
                    "Autorizar a un miembro como supervisor",
                  )}
                  <select
                    value={leader}
                    onChange={(e) => setLeader(e.target.value)}
                  >
                    <option value="">—</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.employee_number ?? m.user_id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy || !leader}
                  onClick={() => void assignLeader()}
                >
                  {t("Grant crew access", "Autorizar acceso")}
                </button>
                {leaders.map((id) => (
                  <p key={id}>
                    {members.find((m) => m.user_id === id)?.employee_number ??
                      id}{" "}
                    <button
                      disabled={busy}
                      onClick={() => void assignLeader(true, id)}
                    >
                      {t("Remove access", "Quitar acceso")}
                    </button>
                  </p>
                ))}
              </div>
            </details>
          )}
          {canEnter ? (
            <section className="card form">
              <h2>{t("Submit crew time", "Registrar horas")}</h2>
              <p>
                {t(
                  "Times use this device's timezone:",
                  "Zona horaria del dispositivo:",
                )}{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
              <fieldset disabled={busy}>
                <legend>{t("Workers", "Trabajadores")}</legend>
                {workers
                  .filter((w) => w.active)
                  .map((w) => (
                    <label className="inline" key={w.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(w.id)}
                        onChange={(e) => {
                          batchAttempt.current = null;
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, w.id]
                              : ids.filter((id) => id !== w.id),
                          );
                        }}
                      />
                      {w.name} · {w.employee_number}
                    </label>
                  ))}
              </fieldset>
              <div className="grid-2">
                {(
                  [
                    ["start", "Start", "Inicio", "datetime-local"],
                    ["end", "End", "Fin", "datetime-local"],
                    [
                      "breaks",
                      "Unpaid break minutes",
                      "Minutos de descanso no pagado",
                      "number",
                    ],
                    ["job", "Job", "Trabajo", "text"],
                    ["field", "Field", "Campo", "text"],
                  ] as const
                ).map(([key, en, sp, type]) => (
                  <label key={key}>
                    {t(en, sp)}
                    <input
                      type={type}
                      value={form[key]}
                      disabled={busy}
                      onChange={(e) => {
                        batchAttempt.current = null;
                        setForm({ ...form, [key]: e.target.value });
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  navigator.geolocation?.getCurrentPosition(
                    (p) =>
                      setGps({
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                      }),
                    () =>
                      setMessage(
                        t(
                          "Location unavailable; time can still be recorded.",
                          "Ubicación no disponible; puede registrar las horas.",
                        ),
                      ),
                  )
                }
              >
                {t(
                  "Attach supervisor location",
                  "Adjuntar ubicación del supervisor",
                )}
              </button>
              <p className="small">
                {gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} · ` : ""}
                {t(
                  "Location describes this device, not each worker's whereabouts.",
                  "La ubicación corresponde a este dispositivo, no a cada trabajador.",
                )}
              </p>
              <button
                className="btn"
                disabled={busy}
                onClick={() => void submit()}
              >
                {t("Save crew time for review", "Guardar horas para revisión")}
              </button>
            </section>
          ) : (
            <p>
              {t(
                "Ask the farm owner to grant crew supervisor access.",
                "Pida al propietario que autorice su acceso como supervisor.",
              )}
            </p>
          )}
          <section className="card stack">
            <h2>{t("Device queue", "Registros pendientes")}</h2>
            <p>
              {pending.length}{" "}
              {t(
                "crew batches waiting on this device",
                "grupos pendientes en este dispositivo",
              )}
            </p>
            <div className="inline">
              <button disabled={busy} onClick={() => void sync()}>
                {t("Send pending crew records", "Enviar registros pendientes")}
              </button>
              <button
                onClick={() =>
                  download(
                    "crew-device-backup.json",
                    JSON.stringify(crewBackup(ctx.userId, farmId), null, 2),
                    "application/json",
                  )
                }
              >
                {t("Back up device records", "Respaldar registros")}
              </button>
            </div>
            {pending.map((b) => (
              <p key={b.id}>
                {b.entries.length} · {new Date(b.createdAt).toLocaleString()}{" "}
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          "Discard this device batch? Export a backup first if needed.",
                          "¿Eliminar este grupo? Exporte un respaldo primero si lo necesita.",
                        ),
                      )
                    ) {
                      removeCrewBatch(b);
                      setPending(crewBatches(ctx.userId, farmId));
                    }
                  }}
                >
                  {t("Discard", "Eliminar")}
                </button>
              </p>
            ))}
          </section>
          <section className="card stack">
            <h2>{t("Review and export", "Revisar y exportar")}</h2>
            <p>
              {t(
                "Export periods use the shift start date in the farm timezone:",
                "Los períodos usan la fecha de inicio en la zona horaria de la finca:",
              )}{" "}
              {zone}.{" "}
              {t(
                "Crew records export as CSV; individual clock entries use the existing QuickBooks sync.",
                "Los registros de cuadrilla se exportan como CSV; los relojes individuales usan QuickBooks.",
              )}
            </p>
            <div className="row">
              <label>
                {t("Period start", "Inicio del período")}
                <input
                  type="date"
                  value={period.start}
                  onChange={(e) =>
                    setPeriod({ ...period, start: e.target.value })
                  }
                />
              </label>
              <label>
                {t("Period end", "Fin del período")}
                <input
                  type="date"
                  value={period.end}
                  onChange={(e) =>
                    setPeriod({ ...period, end: e.target.value })
                  }
                />
              </label>
            </div>
            <button disabled={busy} onClick={() => void exportCsv()}>
              {t(
                "Download all approved time in period",
                "Descargar todas las horas aprobadas del período",
              )}
            </button>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("Worker", "Trabajador")}</th>
                    <th>{t("Start", "Inicio")}</th>
                    <th>{t("Hours", "Horas")}</th>
                    <th>{t("Status / supervisor", "Estado / supervisor")}</th>
                    <th>{t("Review", "Revisión")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {workers.find((w) => w.id === r.worker_id)?.name ??
                          r.worker_id}
                      </td>
                      <td>{new Date(r.clock_in).toLocaleString()}</td>
                      <td>
                        {hoursBetween(
                          r.clock_in,
                          r.clock_out,
                          r.break_minutes,
                        ).toFixed(2)}
                      </td>
                      <td>
                        {r.approval_status} · {r.entered_by.slice(0, 8)}
                        {r.review_reason && <p>{r.review_reason}</p>}
                      </td>
                      <td>
                        {ctx.role === "owner" && (
                          <>
                            <button
                              disabled={
                                busy || r.approval_status === "approved"
                              }
                              onClick={() => void review(r, "approved")}
                            >
                              {t("Approve", "Aprobar")}
                            </button>
                            <button
                              disabled={
                                busy || r.approval_status === "rejected"
                              }
                              onClick={() => void review(r, "rejected")}
                            >
                              {t("Reject", "Rechazar")}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {entries.length >= limit && (
              <button onClick={() => setLimit((n) => n + 100)}>
                {t("Load older entries", "Cargar registros anteriores")}
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}
