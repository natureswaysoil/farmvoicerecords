"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { getNamedFarmContexts, type FarmContext } from "@/src/lib/farm-cloud";
export default function WorkerPage() {
  const [es, setEs] = useState(true),
    [farms, setFarms] = useState<FarmContext[]>([]),
    [farmId, setFarmId] = useState(""),
    [active, setActive] = useState<{ id: string; clock_in: string } | null>(
      null,
    ),
    [job, setJob] = useState(""),
    [field, setField] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [db] = useState(createClient);
  const t = (en: string, sp: string) => (es ? sp : en);
  const ctx = farms.find((f) => f.farmId === farmId);
  useEffect(() => {
    void getNamedFarmContexts(db).then((rows) => {
      const workers = rows.filter((f) => f.role === "worker");
      setFarms(workers);
      setFarmId(workers[0]?.farmId ?? "");
    });
  }, [db]);
  useEffect(() => {
    setActive(null);
    if (!ctx) return;
    let keep = true;
    void db
      .from("time_entries")
      .select("id,clock_in")
      .eq("farm_id", ctx.farmId)
      .eq("worker_user_id", ctx.userId)
      .is("clock_out", null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (keep) {
          setActive(data);
          if (error)
            setMessage(
              t(
                "Could not load your time. Reload before clocking in.",
                "No se pudo cargar su horario. Recargue antes de registrar entrada.",
              ),
            );
        }
      });
    return () => {
      keep = false;
    };
  }, [ctx, db, es]);
  async function clock() {
    if (!ctx) return;
    setBusy(true);
    try {
      if (!navigator.onLine)
        throw new Error(
          t(
            "Time clock needs a connection. Ask your supervisor to record your hours.",
            "El reloj requiere conexión. Pida a su supervisor que registre sus horas.",
          ),
        );
      const gps = await new Promise<GeolocationPosition | null>((resolve) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(
              resolve,
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 10000 },
            )
          : resolve(null),
      );
      const prefix = active ? "clock_out" : "clock_in";
      const values = {
        [prefix]: new Date().toISOString(),
        [`${prefix}_lat`]: gps?.coords.latitude ?? null,
        [`${prefix}_lng`]: gps?.coords.longitude ?? null,
        [`${prefix}_accuracy_m`]: gps?.coords.accuracy ?? null,
      };
      const result = active
        ? await db
            .from("time_entries")
            .update(values)
            .eq("id", active.id)
            .eq("farm_id", farmId)
            .eq("worker_user_id", ctx.userId)
            .is("clock_out", null)
            .select("id")
        : await db
            .from("time_entries")
            .insert({
              ...values,
              farm_id: farmId,
              worker_user_id: ctx.userId,
              job: job.trim() || "Field work",
              field_name: field.trim() || null,
              approval_status: "pending",
            })
            .select("id,clock_in");
      if (result.error || !result.data?.length)
        throw new Error(
          t(
            "Time could not be saved. Refresh to check before retrying.",
            "No se pudo guardar. Actualice para verificar antes de reintentar.",
          ),
        );
      if (active) setActive(null);
      else setActive(result.data[0] as { id: string; clock_in: string });
      setMessage(
        t("Time saved.", "Horario guardado.") +
          (gps ? "" : t(" GPS was unavailable.", " GPS no disponible.")),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
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
          <Link href="/login?next=/worker">
            {t("Sign in", "Iniciar sesión")}
          </Link>
          <Link href="/join">{t("Join farm", "Unirse a una finca")}</Link>
        </>
      ) : (
        <section className="card form">
          <label>
            {t("Farm", "Finca")}
            <select
              value={farmId}
              disabled={busy}
              onChange={(e) => setFarmId(e.target.value)}
            >
              {farms.map((f) => (
                <option key={f.farmId} value={f.farmId}>
                  {f.farmName ?? f.farmId}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Job", "Trabajo")}
            <input value={job} onChange={(e) => setJob(e.target.value)} />
          </label>
          <label>
            {t("Field", "Campo")}
            <input value={field} onChange={(e) => setField(e.target.value)} />
          </label>
          <p>
            {active
              ? t(
                  `Clocked in: ${new Date(active.clock_in).toLocaleString()}`,
                  `Entrada: ${new Date(active.clock_in).toLocaleString()}`,
                )
              : t("Not clocked in", "Sin entrada activa")}
          </p>
          <button className="btn" disabled={busy} onClick={() => void clock()}>
            {busy
              ? t("Saving…", "Guardando…")
              : active
                ? t("Clock out", "Registrar salida")
                : t("Clock in", "Registrar entrada")}
          </button>
          <p>
            {t(
              "Location is requested only when you clock in or out.",
              "Se solicita su ubicación solo al registrar entrada o salida.",
            )}
          </p>
        </section>
      )}
      <p role="status">{message}</p>
    </main>
  );
}
