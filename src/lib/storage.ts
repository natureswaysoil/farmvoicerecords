"use client";

export type SavedRecord = {
  id: string;
  type: "pesticide" | "purchase";
  createdAt: string;
  status: "draft" | "confirmed";
  payload: Record<string, unknown>;
};

const KEY = "farmvoice.records.v1";

export function loadRecords(): SavedRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecord(record: SavedRecord): void {
  const records = loadRecords();
  window.localStorage.setItem(KEY, JSON.stringify([record, ...records]));
}

export function csvFromRecords(records: SavedRecord[]): string {
  const headers = ["id", "type", "createdAt", "status", "payload"];
  const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...records.map((r) => [r.id, r.type, r.createdAt, r.status, JSON.stringify(r.payload)].map(esc).join(","))].join("\n");
}
