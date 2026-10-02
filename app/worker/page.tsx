"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getNamedFarmContexts, type FarmContext } from "@/src/lib/farm-cloud";
import {
  activeQueuedWorkerTime,
  queuedWorkerTimes,
  removeWorkerTime,
  storeWorkerTime,
  syncWorkerTimes,
  type OfflineWorkerTime,
} from "@/src/lib/worker-time-offline";

type Active = { id: string; clock_in: string; queued?: boolean };

export default function WorkerPage() {
  const [es, setEs] = useState(true),
    [farms, setFarms] = useState<FarmContext[]>([]),
    [farmId, setFarmId] = useState(""),
    [active, setActive] = useState<Active | null>(null),
    [job, setJob] = useState(""),
    [field, setField] = useState(""),
    [busy, setBusy] = useState(false),
    [loadingTime, setLoadingTime] = useState(true),
    [pending, setPending] = useState(0),
    [online, setOnline] = useState(true),
    [message, setMessage] = useState("");
  const [db] = useState(createClient);
  const t = (en: string, sp: string) => (es ? sp : en);
  const ctx = farms.find((f) => f.farmId === farmId);

  async function loadFarms() {
    const rows = await getNamedFarmContexts(db);
    const workers = rows.filter((f) => f.role === "worker");
    setFarms(workers);
    const selected = localStorage.getItem("farmvoice_selected_farm_id");
    setFarmId(
      workers.find((f) => f.farmId === selected)?.farmId ??
        workers[0]?.farmId ??
        "",
    );
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void loadFarms().catch(() =>
      setMessage(
        "Could not load farm access. Reconnect and retry. / No se pudo cargar el acceso. Reconecte y reintente.",
      ),
    );
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [db]);

  useEffect(() => {
    setActive(null);
    setLoadingTime(true);
    if (!ctx) return;
    let keep = true;

    const refresh = async () => {
      const queued = queuedWorkerTimes(ctx.userId, ctx.farmId);
      if (keep) setPending(queued.length);
      const queuedActive = activeQueuedWorkerTime(ctx.userId, ctx.farmId);
      if (!navigator.onLine) {
        if (keep) {
          setActive(
            queuedActive
              ? { id: queuedActive.id, clock_in: queuedActive.clockIn, queued: true }
              : null,
          );
          setLoadingTime(false);
          setMessage(
            queued.length
              ? t(
                  `${queued.length} time event(s) waiting to sync.`,
                  `${queued.length} evento(s) de horario pendientes de sincronizar.`,
                )
              : t("Offline mode ready.", "Modo sin conexión listo."),
          );
        }
        return;
      }

      try {
        await syncWorkerTimes(db, ctx.userId, ctx.farmId);
        const { data, error } = await db
          .from("time_entries")
          .select("id,clock_in")
          .eq("farm_id", ctx.farmId)
          .eq("worker_user_id", ctx.userId)
          .is("clock_out", null)
          .maybeSingle();
        if (error) throw error;
        if (keep) {
          setActive(data as Active | null);
          setPending(queuedWorkerTimes(ctx.userId, ctx.farmId).length);
          setLoadingTime(false);
          setMessage("");
        }
      } catch {
        if (keep) {
          setActive(
            queuedActive
              ? { id: queuedActive.id, clock_in: queuedActive.clockIn, queued: true }
              : null,
          );
          setLoadingTime(false);
          setMessage(
            t(
              "Could not sync time yet. Saved events remain on this device.",
              "Todavía no se pudo sincronizar. Los eventos guardados permanecen en este dispositivo.",
            ),
          );
        }
      }
    };

    void refresh();
    window.addEventListener("online", refresh);
    return () => {
      keep = false;
      window.removeEventListener("online", refresh);
    };
  }, [ctx, db, es]);

  async function captureGps() {
    return await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(
            resolve,
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
          )
        : resolve(null),
    );
  }

  async function clock() {
    if (!ctx || loadingTime) return;
    setBusy(true);
    try {
      const gps = await captureGps();
      const now = new Date().toISOString();

      if (!active) {
        const row: OfflineWorkerTime = {
          id: crypto.randomUUID(),
          farmId: ctx.farmId,
          userId: ctx.userId,
          job: job.trim() || "Field work",
          fieldName: field.trim() || null,
          clockIn: now,
          clockOut: null,
          clockInLat: gps?.coords.latitude ?? null,
          clockInLng: gps?.coords.longitude ?? null,
          clockInAccuracyM: gps?.coords.accuracy ?? null,
          clockOutLat: null,
          clockOutLng: null,
          clockOutAccuracyM: null,
          mode: "insert",
          queuedAt: now,
        };

        if (!navigator.onLine) {
          storeWorkerTime(row);
          setActive({ id: row.id, clock_in: row.clockIn, queued: true });
          setPending(queuedWorkerTimes(ctx.userId, ctx.farmId).length);
          setMessage(
            t(
              "Clock-in saved on this device. It will sync when service returns.",
              "Entrada guardada en este dispositivo. Se sincronizará cuando vuelva la señal.",
            ),
          );
          return;
        }

        const result = await db.from("time_entries").insert({
          id: row.id,
          farm_id: row.farmId,
          worker_user_id: row.userId,
          job: row.job,
          field_name: row.fieldName,
          clock_in: row.clockIn,
          clock_in_lat: row.clockInLat,
          clock_in_lng: row.clockInLng,
          clock_in_accuracy_m: row.clockInAccuracyM,
          approval_status: "pending",
        }).select("id,clock_in");

        if (result.error || !result.data?.length) {
          storeWorkerTime(row);
          setActive({ id: row.id, clock_in: row.clockIn, queued: true });
          setPending(queuedWorkerTimes(ctx.userId, ctx.farmId).length);
          setMessage(
            t(
              "Connection was uncertain. Clock-in is safely queued on this device.",
              "La conexión fue incierta. La entrada quedó guardada de forma segura en este dispositivo.",
            ),
          );
          return;
        }

        setActive(result.data[0] as Active);
        setMessage(
          t("Clock-in saved.", "Entrada guardada.") +
            (gps ? "" : t(" GPS was unavailable.", " GPS no disponible.")),
        );
        return;
      }

      const queued = queuedWorkerTimes(ctx.userId, ctx.farmId).find(
        (row) => row.id === active.id,
      );

      if (queued) {
        const completed: OfflineWorkerTime = {
          ...queued,
          clockOut: now,
          clockOutLat: gps?.coords.latitude ?? null,
          clockOutLng: gps?.coords.longitude ?? null,
          clockOutAccuracyM: gps?.coords.accuracy ?? null,
        };
        storeWorkerTime(completed);
        if (navigator.onLine) {
          try {
            await syncWorkerTimes(db, ctx.userId, ctx.farmId);
          } catch {}
        }
        setActive(null);
        setPending(queuedWorkerTimes(ctx.userId, ctx.farmId).length);
        setMessage(
          navigator.onLine
            ? t("Clock-out saved.", "Salida guardada.")
            : t(
                "Clock-out saved on this device. It will sync when service returns.",
                "Salida guardada en este dispositivo. Se sincronizará cuando vuelva la señal.",
              ),
        );
        return;
      }

      const updateRow: OfflineWorkerTime = {
        id: active.id,
        farmId: ctx.farmId,
        userId: ctx.userId,
        job: job.trim() || "Field work",
        fieldName: field.trim() || null,
        clockIn: active.clock_in,
        clockOut: now,
        clockInLat: null,
        clockInLng: null,
        clockInAccuracyM: null,
        clockOutLat: gps?.coords.latitude ?? null,
        clockOutLng: gps?.coords.longitude ?? null,
        clockOutAccuracyM: gps?.coords.accuracy ?? null,
        mode: "update",
        queuedAt: now,
      };

      if (!navigator.onLine) {
        storeWorkerTime(updateRow);
        setActive(null);
        setPending(queuedWorkerTimes(ctx.userId, ctx.farmId).length);
        setMessage(
          t(
            "Clock-out saved on this device. It will sync when service returns.",
            "Salida guardada en este dispositivo. Se sincronizará cuando vuelva la señal.",
          ),
        );
        return;
      }

      const result = await db
        .from("time_entries")
        .update({
          clock_out: now,
          clock_out_lat: updateRow.clockOutLat,
          clock_out_lng: updateRow.clockOutLng,
          clock_out_accuracy_m: updateRow.clockOutAccuracyM,
        })
        .eq("id", active.id)
        .eq("farm_id", farmId)
        .eq("worker_user_id", ctx.userId)
        .is("clock_out", null)
        .select("id");

      if (result.error || !result.data?.length) {
        storeWorkerTime(updateRow);
        setMessage(
          t(
            "Connection was uncertain. Clock-out is safely queued on this device.",
            "La conexión fue incierta. La salida quedó guardada de forma segura en este dispositivo.",
          ),
        );
      } else {
        removeWorkerTime(updateRow);
        setMessage(t("Clock-out saved.", "Salida guardada."));
      }
      setActive(null);
      setPending(queuedWorkerTimes(ctx.userId, ctx.farmId).length);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container section stack" lang={es ? "es" : "en"}>
      <div className="inline">
        <h1>{t("Worker time clock", "Reloj del trabajador")}</h1>
        <button onClick={() => setEs(!es)}>{es ? "English" : "Español"}</button>
      </div>
      {!ctx ? (
        <>
          <p>
            {t(
              "Sign in and join a farm as a worker.",
              "Inicie sesión y únase a una finca como trabajador.",
            )}
          </p>
          <Link href="/login?next=/worker">{t("Sign in", "Iniciar sesión")}</Link>
          <Link href="/join">{t("Join farm", "Unirse a una finca")}</Link>
        </>
      ) : (
        <section className="card form">
          <div className="notice">
            <strong>{online ? t("Online", "Con conexión") : t("Offline", "Sin conexión")}</strong>
            {pending > 0 && (
              <span> · {t(`${pending} queued`, `${pending} pendiente(s)`)}</span>
            )}
          </div>
          <label>
            {t("Farm", "Finca")}
            <select value={farmId} disabled={busy} onChange={(e) => setFarmId(e.target.value)}>
              {farms.map((f) => (
                <option key={f.farmId} value={f.farmId}>{f.farmName ?? f.farmId}</option>
              ))}
            </select>
          </label>
          <label>{t("Job", "Trabajo")}<input value={job} onChange={(e) => setJob(e.target.value)} /></label>
          <label>{t("Field", "Campo")}<input value={field} onChange={(e) => setField(e.target.value)} /></label>
          <p>
            {active
              ? t(
                  `Clocked in: ${new Date(active.clock_in).toLocaleString()}`,
                  `Entrada: ${new Date(active.clock_in).toLocaleString()}`,
                )
              : t("Not clocked in", "Sin entrada activa")}
          </p>
          <button className="btn" disabled={busy || loadingTime} onClick={() => void clock()}>
            {busy ? t("Saving…", "Guardando…") : active ? t("Clock out", "Registrar salida") : t("Clock in", "Registrar entrada")}
          </button>
          <p>{t("Location is requested only when you clock in or out.", "Se solicita su ubicación solo al registrar entrada o salida.")}</p>
        </section>
      )}
      <p role="status">{message}</p>
    </main>
  );
}
