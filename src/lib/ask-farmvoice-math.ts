export function completedHours(
  rows: Array<{ clock_in: string; clock_out: string | null }>,
): number {
  return rows.reduce((total, row) => {
    if (!row.clock_out) return total;
    const start = Date.parse(row.clock_in);
    const end = Date.parse(row.clock_out);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return total;
    return total + (end - start) / 3_600_000;
  }, 0);
}

export function crewEntryHours(
  rows: Array<{
    clock_in: string;
    clock_out: string;
    break_minutes?: number | null;
  }>,
): number {
  return rows.reduce((total, row) => {
    const start = Date.parse(row.clock_in);
    const end = Date.parse(row.clock_out);
    const breakHours = Math.max(0, Number(row.break_minutes ?? 0)) / 60;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return total;
    return total + Math.max(0, (end - start) / 3_600_000 - breakHours);
  }, 0);
}

export function scheduledHours(
  rows: Array<{ starts_at: string; ends_at: string }>,
): number {
  return rows.reduce((total, row) => {
    const start = Date.parse(row.starts_at);
    const end = Date.parse(row.ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return total;
    return total + (end - start) / 3_600_000;
  }, 0);
}

export function normalizedField(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}
