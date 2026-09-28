export function safeNextPath(value: string | null | undefined, origin: string, fallback = "/records") {
  if (!value) return fallback;

  try {
    const base = new URL(origin);
    const parsed = new URL(value, base);

    if (parsed.origin !== base.origin) return fallback;
    if (parsed.username || parsed.password) return fallback;

    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}
