"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { collectPages } from "@/src/lib/pagination";
type Props = {
  farmId: string;
  userId: string;
  module: "records" | "fields" | "team" | "h2a";
  recordType: string;
  recordId: string;
  parentRecordId?: string | null;
  category?: string;
  label?: string;
  metadata?: Record<string, unknown>;
  gps?: {
    lat: number | null;
    lng: number | null;
    accuracy?: number | null;
    capturedAt?: string | null;
  } | null;
  onUploaded?: (path: string) => void;
  onMessage?: (message: string) => void;
};
type Evidence = {
  id: string;
  file_name: string | null;
  captured_at: string;
  captured_by: string;
  storage_bucket: string;
  storage_path: string;
};
export default function SmartPhotoEvidence(p: Props) {
  const [supabase] = useState(createClient),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false),
    [files, setFiles] = useState<Evidence[]>([]),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null),
    library = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setExpanded(false);
    setFiles([]);
    setError("");
  }, [p.farmId, p.recordId]);
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    void collectPages<Evidence>((from, to) =>
      supabase
        .from("farm_photo_evidence")
        .select(
          "id,file_name,captured_at,captured_by,storage_bucket,storage_path",
        )
        .eq("farm_id", p.farmId)
        .eq("module", p.module)
        .eq("record_type", p.recordType)
        .eq("record_id", p.recordId)
        .order("captured_at", { ascending: false })
        .order("id")
        .range(from, to),
    )
      .then((rows) => {
        if (active) {
          setFiles(rows);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError("Could not load files. Close and reopen to retry.");
      });
    return () => {
      active = false;
    };
  }, [
    expanded,
    refresh,
    p.farmId,
    p.module,
    p.recordType,
    p.recordId,
    supabase,
  ]);
  async function open(file: Evidence) {
    // Open synchronously to avoid mobile popup blockers after the signed-URL request.
    const win = window.open("", "_blank");
    if (!win) {
      p.onMessage?.("Allow pop-ups to view the file.");
      return;
    }
    win.opener = null;
    const { data, error } = await supabase.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, 120);
    if (error || !data) {
      win.close();
      p.onMessage?.("Could not open this file. Check your access and retry.");
      return;
    }
    win.location.assign(data.signedUrl);
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    let path = "";
    let uploaded = false;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a photo or PDF under 10 MB.");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "photo.jpg";
      path = `${p.farmId}/${p.module}/${p.recordType}/${p.recordId}/${crypto.randomUUID()}-${safe}`;
      const up = await supabase.storage
        .from("farm-photo-evidence")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (up.error) throw new Error(up.error.message);
      uploaded = true;
      const row = await supabase
        .from("farm_photo_evidence")
        .insert({
          farm_id: p.farmId,
          module: p.module,
          record_type: p.recordType,
          record_id: p.recordId,
          parent_record_id: p.parentRecordId ?? null,
          category: p.category ?? "general",
          storage_bucket: "farm-photo-evidence",
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          captured_at: new Date().toISOString(),
          captured_by: p.userId,
          gps_lat: p.gps?.lat ?? null,
          gps_lng: p.gps?.lng ?? null,
          gps_accuracy_m: p.gps?.accuracy ?? null,
          gps_captured_at: p.gps?.capturedAt ?? null,
          metadata: p.metadata ?? {},
        });
      if (row.error) throw new Error(row.error.message);
      p.onUploaded?.(path);
      p.onMessage?.("Photo filed with this record. Use View files to open it.");
      setExpanded(true);
      setRefresh((n) => n + 1);
    } catch (e) {
      if (uploaded)
        await supabase.storage.from("farm-photo-evidence").remove([path]);
      p.onMessage?.(
        e instanceof Error ? e.message : "Unable to save photo evidence.",
      );
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
    }
  }
  return (
    <div className="stack">
      <div className="inline">
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => camera.current?.click()}
        >
          {busy ? "Uploading…" : (p.label ?? "Take photo")}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => library.current?.click()}
        >
          Choose photo / PDF
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide files" : "View files"}
        </button>
      </div>
      <input
        ref={camera}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <input
        ref={library}
        hidden
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      {expanded && (
        <div>
          {error ? (
            <p role="status">{error}</p>
          ) : files.length ? (
            <ul>
              {files.map((f) => (
                <li key={f.id}>
                  <button onClick={() => void open(f)}>
                    {f.file_name ?? "Open attachment"}
                  </button>{" "}
                  · {new Date(f.captured_at).toLocaleString()} ·{" "}
                  {f.captured_by === p.userId
                    ? "Uploaded by you"
                    : `Uploader ${f.captured_by.slice(0, 8)}`}
                </li>
              ))}
            </ul>
          ) : (
            <p>No attached files.</p>
          )}
        </div>
      )}
    </div>
  );
}
