import { csvCell } from "../pagination.ts";
export type ExportRecord = {
  id: string;
  record_type: string;
  status: string;
  created_at: string;
  received_at?: string | null;
  payload: Record<string, unknown>;
  revision?: number;
};
const labels: Record<string, string> = {
  epaRegNumber: "EPA registration number",
  epaRegistrationNumber: "EPA registration number",
  isRestrictedUse: "Restricted-use pesticide",
  recordCreatedAt: "Device capture time (UTC)",
  gps: "GPS capture details",
};
export const recordLabel = (key: string) =>
  labels[key] ??
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
export function recordsCsv(rows: ExportRecord[]) {
  const keys = [
    ...new Set(
      rows.flatMap((r) =>
        Object.keys(r.payload).filter((key) => key !== "recordCreatedAt"),
      ),
    ),
  ].sort();
  return [
    [
      "Record ID",
      "Record type",
      "Status",
      "Device capture time (UTC)",
      "Server received time (UTC)",
      "Revision",
      ...keys.map(recordLabel),
    ]
      .map(csvCell)
      .join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.record_type,
        r.status,
        r.created_at,
        r.received_at ?? "Unknown (legacy record)",
        r.revision ?? 1,
        ...keys.map((k) =>
          typeof r.payload[k] === "object"
            ? JSON.stringify(r.payload[k])
            : r.payload[k],
        ),
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}
const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function recordPacket(rows: ExportRecord[]) {
  return `<!doctype html><html><head><title>FarmVoice field records</title><style>body{font:14px Arial;margin:32px;color:#172117}article{break-inside:avoid;border-bottom:1px solid #ccc;padding:16px 0}table{width:100%;border-collapse:collapse}td,th{padding:6px;border:1px solid #ddd;text-align:left;overflow-wrap:anywhere}h1{font-size:24px}</style></head><body><h1>FarmVoice field records</h1><p>${rows.length} record(s). Generated ${escape(new Date().toISOString())}. Review against your original records and applicable requirements.</p>${rows
    .map(
      (r) =>
        `<article><h2>${escape(r.record_type)} · ${escape(r.status)}</h2><p>Record ${escape(r.id)} · Revision ${r.revision ?? 1}</p><p>Device capture time (UTC): ${escape(r.created_at)}<br>Server received time (UTC): ${escape(r.received_at ?? "Unknown (legacy record)")}</p><table>${Object.entries(
          r.payload,
        )
          .filter(([key]) => key !== "recordCreatedAt")
          .map(
            ([k, v]) =>
              `<tr><th>${escape(recordLabel(k))}</th><td>${escape(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`,
          )
          .join("")}</table></article>`,
    )
    .join("")}</body></html>`;
}
