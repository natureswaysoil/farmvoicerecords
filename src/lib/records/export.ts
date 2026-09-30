import { csvCell } from "../pagination.ts";
export type ExportRecord = {
  id: string;
  record_type: string;
  status: string;
  created_at: string;
  payload: Record<string, unknown>;
  revision?: number;
};
export function recordsCsv(rows: ExportRecord[]) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.payload)))].sort();
  return [
    ["id", "type", "status", "created_at", "revision", ...keys]
      .map(csvCell)
      .join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.record_type,
        r.status,
        r.created_at,
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
        `<article><h2>${escape(r.record_type)} · ${escape(r.status)}</h2><p>Record ${escape(r.id)} · Revision ${r.revision ?? 1} · ${escape(r.created_at)}</p><table>${Object.entries(
          r.payload,
        )
          .map(
            ([k, v]) =>
              `<tr><th>${escape(k.replace(/([A-Z])/g, " $1"))}</th><td>${escape(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`,
          )
          .join("")}</table></article>`,
    )
    .join("")}</body></html>`;
}
