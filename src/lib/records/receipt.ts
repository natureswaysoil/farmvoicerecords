export function validCaptureTime(value: string, now = Date.now()): boolean {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    timestamp >= now - 30 * 86400000 &&
    timestamp <= now + 5 * 60000
  );
}
