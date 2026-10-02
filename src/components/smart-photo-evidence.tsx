"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { collectPages } from "@/src/lib/pagination";
import {
  queueEvidenceWithinLock,
  queuedEvidence,
  syncEvidence,
  withEvidenceSerialization,
  type QueuedEvidence,
} from "@/src/lib/evidence-offline";

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
  queued?: boolean;
};

export default function SmartPhotoEvidence(p: Props) {
  const [supabase] = useState(createClient),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false),
    [files, setFiles] = useState<Evidence[]>([]),
    [pending, setPending] = useState(0),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null),
    library = useRef<HTMLInputElement>(null);

  async function refreshPending() {
    try {
      const rows = await queuedEvidence(p.farmId, p.userId);
      setPending(rows.length);
      return rows;
    } catch {
      return [] as QueuedEvidence[];
    }
  }

  useEffect(() => {
    setExpanded(false);
    setFiles([]);
    setError("");
    void refreshPending();
  }, [p.farmId, p.recordId, p.userId]);

  useEffect(() => {
    const reconnect = async () => {
      try {
        const count = await syncEvidence(supabase, p.farmId, p.userId);
        await refreshPending();
        if (count) {
          p.onMessage?.(`Synced ${count} queued evidence file(s).`);
          setRefresh((n) => n + 1);
        }
      } catch {
        p.onMessage?.("Some evidence files are still waiting to sync.");
      }
    };
    window.addEventListener("online", reconnect);
    if (navigator.onLine) void reconnect();
    return () => window.removeEventListener("online", reconnect);
  }, [p.farmId, p.userId, supabase]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    const load = async () => {
      const pendingRows = await refreshPending();
      const localFiles: Evidence[] = pendingRows
        .filter(
          (x) =>
            x.recordId === p.recordId &&
            x.recordType === p.recordType &&
            x.module === p.module,
        )
        .map((x) => ({
          id: x.id,
          file_name: x.fileName,
          captured_at: x.capturedAt,
          captured_by: x.userId,
          storage_bucket: "farm-photo-evidence",
          storage_path: x.storagePath,
          queued: true,
        }));

      if (!navigator.onLine) {
        if (active) {
          setFiles(localFiles);
          setError("");
        }
        return;
      }

      try {
        const rows = await collectPages<Evidence>((from, to) =>
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
        );
        if (active) {
          const ids = new Set(rows.map((x) => x.id));
          setFiles([...localFiles.filter((x) => !ids.has(x.id)), ...rows]);
          setError("");
        }
      } catch {
        if (active) {
          setFiles(localFiles);
          setError("Cloud files could not be loaded. Queued files remain on this device.");
        }
      }
    };
    void load();
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
    p.userId,
    supabase,
  ]);

  async function open(file: Evidence) {
    if (file.queued) {
      p.onMessage?.("This file is still on this device and will be available from the cloud after sync.");
      return;
    }
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

  async function saveOfflineWithinLock(item: QueuedEvidence) {
    await queueEvidenceWithinLock(item);
    await refreshPending();
    p.onUploaded?.(item.storagePath);
    p.onMessage?.("Evidence saved on this device. It will upload automatically when service returns.");
    setExpanded(true);
    setRefresh((n) => n + 1);
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    if (file.size > 10 * 1024 * 1024) {
      p.onMessage?.("Choose a photo or PDF under 10 MB.");
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
      return;
    }
    setBusy(true);
    const id = crypto.randomUUID();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "photo.jpg";
    const path = `${p.farmId}/${p.module}/${p.recordType}/${p.recordId}/${id}-${safe}`;
    const capturedAt = new Date().toISOString();
    const item: QueuedEvidence = {
      id,
      farmId: p.farmId,
      userId: p.userId,
      module: p.module,
      recordType: p.recordType,
      recordId: p.recordId,
      parentRecordId: p.parentRecordId ?? null,
      category: p.category ?? "general",
      storagePath: path,
      fileName: file.name,
      mimeType: file.type || "",
      capturedAt,
      gps: p.gps ?? null,
      metadata: p.metadata ?? {},
      blob: file,
    };

    let uploaded = false;
    try {
      await withEvidenceSerialization(p.farmId, p.userId, async () => {
        if (!navigator.onLine) {
          await saveOfflineWithinLock(item);
          return;
        }

        const up = await supabase.storage
        .from("farm-photo-evidence")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (up.error) throw new Error(up.error.message);
      uploaded = true;

      const row = await supabase
        .from("farm_photo_evidence")
        .insert({
          id,
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
          captured_at: capturedAt,
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
      });
    } catch (e) {
      try {
        await withEvidenceSerialization(p.farmId, p.userId, async () => {
          if (uploaded) {
            try {
              await supabase.storage.from("farm-photo-evidence").remove([path]);
            } catch {}
          }
          await saveOfflineWithinLock(item);
        });
      } catch {
        p.onMessage?.(
          e instanceof Error ? e.message : "Unable to save photo evidence.",
        );
      }
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
    }
  }

  return (
    <div className="stack">
      <div className="inline">
        <button type="button" className="btn secondary" disabled={busy} onClick={() => camera.current?.click()}>
          {busy ? "Saving…" : (p.label ?? "Take photo")}
        </button>
        <button type="button" className="btn secondary" disabled={busy} onClick={() => library.current?.click()}>
          Choose photo / PDF
        </button>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide files" : "View files"}
        </button>
        {pending > 0 && <span className="badge">{pending} evidence file(s) queued</span>}
      </div>
      <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={(e) => void upload(e.target.files?.[0])} />
      <input ref={library} hidden type="file" accept="image/*,application/pdf" onChange={(e) => void upload(e.target.files?.[0])} />
      {expanded && (
        <div>
          {error && <p role="status">{error}</p>}
          {files.length ? (
            <ul>
              {files.map((f) => (
                <li key={f.id}>
                  <button onClick={() => void open(f)}>{f.file_name ?? "Open attachment"}</button>
                  {" "}· {new Date(f.captured_at).toLocaleString()} ·{" "}
                  {f.queued ? "Waiting to sync" : f.captured_by === p.userId ? "Uploaded by you" : `Uploader ${f.captured_by.slice(0, 8)}`}
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
