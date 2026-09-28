export function safeNextPath(
  candidate: string | null | undefined,
  origin: string,
  fallback = "/records",
) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, origin);
    if (parsed.origin !== origin) return fallback;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}

export function isJoinPath(path: string, origin: string) {
  try {
    const parsed = new URL(path, origin);
    return parsed.origin === origin && (parsed.pathname === "/join" || parsed.pathname.startsWith("/join/"));
  } catch {
    return false;
  }
}
