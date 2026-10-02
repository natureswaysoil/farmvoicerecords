/** Fetch every page, including APIs configured with a row cap below our requested size. */
export async function collectPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await fetchPage(
      rows.length,
      rows.length + size - 1,
    );
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
export async function collectChunkedPages<T, K>(
  values: K[],
  fetchPage: (
    chunk: K[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = 100,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    const chunk = values.slice(offset, offset + chunkSize);
    rows.push(
      ...(await collectPages<T>(
        (from, to) => fetchPage(chunk, from, to),
        pageSize,
      )),
    );
  }
  return rows;
}

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function hoursBetween(start: string, end: string, breakMinutes = 0) {
  return Math.max(
    0,
    (Date.parse(end) - Date.parse(start)) / 3600000 - breakMinutes / 60,
  );
}
