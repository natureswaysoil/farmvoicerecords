"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import {
  getNamedFarmContexts,
  loadCloudFields,
  type FarmContext,
  type CloudField,
} from "@/src/lib/farm-cloud";
import {
  validatePesticideRecord,
  type PesticideRecord,
} from "@/src/compliance/pesticide-record-validation";
import {
  pesticideKeys,
  purchaseKeys,
  purchaseProblems,
  fillEmptyFields,
  type SuggestedField,
} from "@/src/lib/records/schema";
import {
  queueRecord,
  queuedRecords,
  syncRecords,
} from "@/src/lib/records/offline";
import SmartPhotoEvidence from "@/src/components/smart-photo-evidence";
const labels: Record<string, [string, string]> = {
  applicatorName: ["Applicator name", "Nombre del aplicador"],
  certificationNumber: ["Certification number", "Número de certificación"],
  productName: ["Product name", "Nombre del producto"],
  epaRegNumber: ["EPA registration number", "Número de registro EPA"],
  amountApplied: ["Total amount applied", "Cantidad total aplicada"],
  amountUnit: ["Amount unit", "Unidad"],
  cropOrSite: ["Crop or site treated", "Cultivo o sitio tratado"],
  fieldLocation: ["Field / location", "Campo / ubicación"],
  areaTreated: ["Area treated", "Superficie tratada"],
  areaUnit: ["Area unit", "Unidad de superficie"],
  applicationDate: ["Application date", "Fecha de aplicación"],
  vendor: ["Vendor", "Proveedor"],
  item: ["Item purchased", "Artículo comprado"],
  quantity: ["Quantity", "Cantidad"],
  unit: ["Unit", "Unidad"],
  totalCost: ["Total cost (USD)", "Costo total (USD)"],
  purchaseDate: ["Purchase date", "Fecha de compra"],
};
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function RecordsPage() {
  const [supabase] = useState(createClient);
  const [language, setLanguage] = useState<0 | 1>(0);
  const t = (en: string, es: string) => (language ? es : en);
  const [exporting, setExporting] = useState(false);
  const [contexts, setContexts] = useState<FarmContext[]>([]),
    [farmId, setFarmId] = useState("");
  const ctx = contexts.find((c) => c.farmId === farmId);
  const [loaded, setLoaded] = useState(false),
    [fields, setFields] = useState<CloudField[]>([]),
    [fieldId, setFieldId] = useState("");
  const [type, setType] = useState<"pesticide" | "purchase">("pesticide"),
    [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({
    isRestrictedUse: false,
    state: "NC",
  });
  const [suggestions, setSuggestions] = useState<
    Record<string, SuggestedField>
  >({});
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(0),
    [review, setReview] = useState(false);
  const [recent, setRecent] = useState<
    {
      id: string;
      record_type: string;
      status: string;
      created_at: string;
      payload: unknown;
    }[]
  >([]);
  const [gps, setGps] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: string;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAttempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const [audioDone, setAudioDone] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  useEffect(() => {
    if (!audio) return;
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) {
          if (active) {
            setContexts([]);
            setLoaded(true);
          }
          return;
        }
        const cacheKey = `farmvoice-contexts:${user.id}`;
        const rows = navigator.onLine
          ? await getNamedFarmContexts(supabase)
          : (JSON.parse(
              localStorage.getItem(cacheKey) ?? "[]",
            ) as FarmContext[]);
        if (navigator.onLine)
          localStorage.setItem(cacheKey, JSON.stringify(rows));
        if (active) {
          setContexts(rows);
          setFarmId(rows[0]?.farmId ?? "");
          setLoaded(true);
        }
      } catch {
        if (active) {
          setLoaded(true);
          setMessage("Could not load your farms. Reconnect and reload.");
        }
      }
    }
    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setContexts([]);
        setRecent([]);
        setValues({ isRestrictedUse: false });
        setNote("");
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);
  useEffect(() => {
    setRecent([]);
    setFields([]);
    setFieldId("");
    if (!ctx) return;
    const current = ctx;
    let active = true;
    const refresh = async () => {
      setPending(
        queuedRecords(current.userId).filter((r) => r.farmId === current.farmId)
          .length,
      );
      if (!navigator.onLine) return;
      try {
        await syncRecords(current.userId, current.farmId);
        const [f, r] = await Promise.all([
          loadCloudFields(supabase, current.farmId),
          supabase
            .from("farm_records")
            .select("id,record_type,status,created_at,payload")
            .eq("farm_id", current.farmId)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        if (active) {
          setFields(f);
          setRecent(r.data ?? []);
          setPending(
            queuedRecords(current.userId).filter(
              (r) => r.farmId === current.farmId,
            ).length,
          );
        }
      } catch (e) {
        if (active)
          setMessage(
            e instanceof Error
              ? e.message
              : "Sync failed; drafts remain on this device.",
          );
      }
    };
    void refresh();
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      window.removeEventListener("online", refresh);
    };
  }, [ctx, supabase]);
  async function extract(text = note) {
    if (!ctx) return;
    setBusy(true);
    try {
      const response = await fetch("/api/records/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId, type, note: text }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSuggestions(result.suggestions);
      setMessage(
        t(
          "Review the suggestions and apply them to empty fields. Existing entries are preserved.",
          "Revise las sugerencias y aplíquelas a los campos vacíos. Se conservan los datos existentes.",
        ),
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Extraction failed. Your note is still available.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function transcribe(blob: Blob) {
    if (!ctx) return;
    setAudio(blob);
    setAudioDone(false);
    if (!navigator.onLine) {
      setMessage(
        t(
          "Audio is ready to download. Reconnect to transcribe; keep this page open or download the audio.",
          "Descargue el audio. Reconéctese para transcribir; mantenga esta página abierta o descargue el audio.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("farmId", farmId);
      form.set("audio", blob, "recording");
      const response = await fetch("/api/records/transcribe", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const text = [note, result.text].filter(Boolean).join(" ");
      setNote(text);
      setAudioDone(true);
      setBusy(false);
      await extract(text);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Transcription failed. Download the audio or retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      recorder.current = media;
      const chunks: Blob[] = [];
      let size = 0;
      media.ondataavailable = (e) => {
        chunks.push(e.data);
        size += e.data.size;
        if (size > 3_000_000 && media.state === "recording") media.stop();
      };
      media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        setRecording(false);
        void transcribe(new Blob(chunks, { type: media.mimeType }));
      };
      media.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (media.state === "recording") media.stop();
      }, 120000);
    } catch {
      setMessage(
        t(
          "Microphone unavailable. Upload an audio file or type your note.",
          "Micrófono no disponible. Suba un archivo de audio o escriba su nota.",
        ),
      );
    }
  }
  function changeType(next: "pesticide" | "purchase") {
    setType(next);
    setValues({ isRestrictedUse: false, state: "NC" });
    setSuggestions({});
    setReview(false);
  }
  const validation = validatePesticideRecord(
    values as unknown as PesticideRecord,
  );
  const problems =
    type === "purchase"
      ? purchaseProblems(values)
      : [...validation.missingFields, ...validation.invalidFields];
  async function save(status: "draft" | "confirmed") {
    if (!ctx) return;
    setReview(true);
    if (status === "confirmed" && problems.length) {
      setMessage(
        t(
          "Complete the required fields first.",
          "Complete primero los campos obligatorios.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const fingerprint = JSON.stringify({
        farmId,
        type,
        status,
        fieldId,
        values,
        note,
        gps,
      });
      if (saveAttempt.current?.fingerprint !== fingerprint)
        saveAttempt.current = { fingerprint, id: crypto.randomUUID() };
      const row = {
        id: saveAttempt.current.id,
        farmId,
        userId: ctx.userId,
        type,
        status,
        createdAt: new Date().toISOString(),
        fieldId: fieldId || null,
        payload: { ...values, transcript: note, gps },
      };
      queueRecord(row);
      setPending(
        queuedRecords(ctx.userId).filter((r) => r.farmId === farmId).length,
      );
      if (navigator.onLine) {
        await syncRecords(ctx.userId, farmId);
        setPending(
          queuedRecords(ctx.userId).filter((r) => r.farmId === farmId).length,
        );
        setRecent((r) => [
          {
            id: row.id,
            record_type: type,
            status,
            created_at: row.createdAt,
            payload: row.payload,
          },
          ...r.filter((x) => x.id !== row.id),
        ]);
        setMessage(
          t(
            "Saved to your farm. Start a new record when ready.",
            "Guardado en su finca. Puede iniciar un nuevo registro.",
          ),
        );
      } else
        setMessage(
          t(
            "Saved on this device. Reopen this page online to sync. Do not clear browser data before delivery.",
            "Guardado en este dispositivo. Abra esta página con conexión para sincronizar. No borre los datos del navegador.",
          ),
        );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? `${e.message} Your queued records can be exported below.`
          : "Could not save. Download a copy before leaving.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportCloud() {
    if (!ctx) return;
    setExporting(true);
    try {
      const rows: unknown[] = [];
      let offset = 0;
      for (;;) {
        const result = await supabase
          .from("farm_records")
          .select("*")
          .eq("farm_id", farmId)
          .order("created_at")
          .order("id")
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        rows.push(...result.data);
        if (result.data.length < 500) break;
        offset += 500;
      }
      download("farmvoice-cloud-records.json", rows);
    } catch {
      setMessage("Could not export cloud records. Reconnect and retry.");
    } finally {
      setExporting(false);
    }
  }
  if (!loaded)
    return (
      <main className="container section">
        <p>Loading your farms…</p>
      </main>
    );
  if (!ctx)
    return (
      <main className="container section stack" lang={language?"es":"en"}>
        <h1>Farm records</h1>
        <p>
          Sign in and create or join a farm to save records under your account.
        </p>
        <Link className="btn" href="/login?next=/records">
          Sign in
        </Link>
        <Link href="/team">Create a farm</Link>
        <Link href="/demo">Explore a sample record</Link>
      </main>
    );
  return (
    <main className="container section stack" lang={language?"es":"en"}>
      <div className="inline">
        <h1>{t("Speak, review and save", "Hable, revise y guarde")}</h1>
        <button
          className="btn secondary"
          onClick={() => setLanguage(language ? 0 : 1)}
        >
          {language ? "English" : "Español"}
        </button>
      </div>
      <p>
        {t(
          "English and Spanish notes become suggested fields. Review every value before confirming. AI processing requires a connection.",
          "Las notas en inglés y español se convierten en campos sugeridos. Revise cada valor antes de confirmar. La IA requiere conexión.",
        )}
      </p>
      <label>
        {t("Farm", "Finca")}
        <select
          value={farmId}
          disabled={busy || recording}
          onChange={(e) => {
            setFarmId(e.target.value);
            setNote("");
            setValues({ isRestrictedUse: false });
            setSuggestions({});
            setGps(null);
            setAudio(null);
          }}
        >
          {contexts.map((c) => (
            <option key={c.farmId} value={c.farmId}>
              {c.farmName ?? c.farmId} ({c.role})
            </option>
          ))}
        </select>
      </label>
      <section className="card form">
        <label>
          {t("Record type", "Tipo de registro")}
          <select
            disabled={busy || recording}
            value={type}
            onChange={(e) => changeType(e.target.value as typeof type)}
          >
            <option value="pesticide">
              {t("Pesticide application", "Aplicación de pesticida")}
            </option>
            <option value="purchase">
              {t("Input purchase", "Compra de insumos")}
            </option>
          </select>
        </label>
        <div className="inline">
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              recording ? recorder.current?.stop() : void start()
            }
          >
            {recording
              ? t("Stop recording", "Detener grabación")
              : t("Record note", "Grabar nota")}
          </button>
          <label>
            {t("Upload audio (up to 3.5 MB)", "Subir audio (hasta 3.5 MB)")}
            <input
              type="file"
              accept="audio/*"
              disabled={busy || recording}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void transcribe(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {audioUrl && (
          <div className="inline">
            <audio controls src={audioUrl} />
            <a href={audioUrl} download="farmvoice-recording">
              {t("Download audio", "Descargar audio")}
            </a>
            <button
              disabled={busy || recording || audioDone}
              onClick={() => audio && void transcribe(audio)}
            >
              {t("Retry transcription", "Reintentar transcripción")}
            </button>
          </div>
        )}
        <label>
          {t(
            "Original spoken or typed note",
            "Nota original hablada o escrita",
          )}
          <textarea
            disabled={busy || recording}
            maxLength={6000}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSuggestions({});
            }}
          />
        </label>
        <button
          className="btn secondary"
          disabled={busy || recording || note.trim().length < 5}
          onClick={() => void extract()}
        >
          {busy
            ? t("Processing…", "Procesando…")
            : t("Suggest fields from note", "Sugerir campos de la nota")}
        </button>
        {Object.keys(suggestions).length > 0 && (
          <section className="notice">
            <h2>{t("Review suggestions", "Revise las sugerencias")}</h2>
            <ul>
              {Object.entries(suggestions).map(([key, s]) => (
                <li key={key}>
                  <strong>
                    {labels[key]?.[language] ?? key}: {s.value}
                  </strong>
                  <br />
                  <small>
                    {t("From note", "De la nota")}: “{s.evidence}”
                  </small>
                </li>
              ))}
            </ul>
            <button
              className="btn"
              onClick={() => {
                setValues((v) => fillEmptyFields(v, suggestions));
                setSuggestions({});
              }}
            >
              {t("Apply to empty fields", "Aplicar a campos vacíos")}
            </button>
          </section>
        )}
        <label>
          {t("Farm field (optional)", "Campo de la finca (opcional)")}
          <select
            value={fieldId}
            onChange={(e) => {
              setFieldId(e.target.value);
              setValues((v) => ({
                ...v,
                fieldLocation:
                  fields.find((f) => f.id === e.target.value)?.name ?? "",
              }));
            }}
          >
            <option value="">—</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid-2">
          {(type === "pesticide" ? pesticideKeys : purchaseKeys).map((key) => (
            <label className="field" key={key}>
              {labels[key][language]}
              <input
                type={key.endsWith("Date") ? "date" : "text"}
                value={String(values[key] ?? "")}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        {type === "pesticide" && (
          <>
            <label>
              {t("State abbreviation", "Abreviatura del estado")}
              <input
                maxLength={2}
                value={String(values.state ?? "")}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    state: e.target.value.toUpperCase(),
                  }))
                }
              />
            </label>
            {(
              [
                [
                  "isRestrictedUse",
                  "Restricted-use pesticide",
                  "Pesticida de uso restringido",
                ],
                [
                  "isSpotTreatment",
                  "Use legacy spot-treatment checklist",
                  "Usar lista histórica de tratamiento localizado",
                ],
                [
                  "isGreenhouseOrNursery",
                  "Greenhouse or nursery",
                  "Invernadero o vivero",
                ],
              ] as const
            ).map(([key, en, es]) => (
              <label className="inline" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(values[key])}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [key]: e.target.checked }))
                  }
                />
                {t(en, es)}
              </label>
            ))}
          </>
        )}
        <button
          className="btn secondary"
          onClick={() =>
            navigator.geolocation.getCurrentPosition(
              (p) =>
                setGps({
                  lat: p.coords.latitude,
                  lng: p.coords.longitude,
                  accuracy: p.coords.accuracy,
                  capturedAt: new Date().toISOString(),
                }),
              () => setMessage("Location unavailable."),
            )
          }
        >
          {t("Capture GPS", "Capturar GPS")}
        </button>
        {gps && (
          <p>
            GPS: {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} ±
            {Math.round(gps.accuracy)}m{" "}
            <button onClick={() => setGps(null)}>×</button>
          </p>
        )}
        {review && problems.length > 0 && (
          <div className="notice warn">
            <strong>{t("Review required", "Revisión requerida")}</strong>
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="small">
          {t(
            "Field completeness is not legal certification. Check state, worker protection and product-label requirements. Legal confirmations are never supplied by AI.",
            "Los campos completos no certifican el cumplimiento legal. Verifique los requisitos estatales, de protección del trabajador y de la etiqueta. La IA no confirma declaraciones legales.",
          )}
        </p>
        <div className="inline">
          <button
            className="btn secondary"
            disabled={busy || recording}
            onClick={() => void save("draft")}
          >
            {t("Save draft", "Guardar borrador")}
          </button>
          <button
            className="btn"
            disabled={busy || recording}
            onClick={() => void save("confirmed")}
          >
            {t("Confirm and save", "Confirmar y guardar")}
          </button>
          <button
            disabled={busy || recording}
            onClick={() => {
              saveAttempt.current = null;
              setValues({ isRestrictedUse: false, state: "NC" });
              setNote("");
              setSuggestions({});
              setAudio(null);
              setGps(null);
              setReview(false);
              setFieldId("");
            }}
          >
            {t("New record", "Nuevo registro")}
          </button>
        </div>
      </section>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <section className="card stack">
        <h2>{t("Delivery and exports", "Entrega y exportaciones")}</h2>
        <button
          onClick={() =>
            download(
              "farmvoice-legacy-device-records.json",
              JSON.parse(localStorage.getItem("farmvoice.records.v1") ?? "[]"),
            )
          }
        >
          {t(
            "Export older unassigned device records",
            "Exportar registros antiguos sin finca asignada",
          )}
        </button>
        <p>
          {pending}{" "}
          {t(
            "records waiting on this device",
            "registros pendientes en este dispositivo",
          )}
        </p>
        <div className="inline">
          <button
            onClick={() =>
              download(
                "farmvoice-pending.json",
                queuedRecords(ctx.userId).filter((r) => r.farmId === farmId),
              )
            }
          >
            {t("Export queued records", "Exportar registros pendientes")}
          </button>
          <button disabled={exporting} onClick={() => void exportCloud()}>
            {t("Export all cloud records", "Exportar todos los registros")}
          </button>
        </div>
        {recent.map((r) => (
          <details key={r.id}>
            <summary>
              {r.record_type} · {r.status} ·{" "}
              {new Date(r.created_at).toLocaleString()}
            </summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(r.payload, null, 2)}
            </pre>
            <SmartPhotoEvidence
              farmId={farmId}
              userId={ctx.userId}
              module="records"
              recordType="farm_record"
              recordId={r.id}
              category="record_evidence"
              gps={gps}
              onMessage={setMessage}
            />
          </details>
        ))}
      </section>
    </main>
  );
}
