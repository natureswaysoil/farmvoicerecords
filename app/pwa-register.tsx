"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CACHEABLE = new Set([
  "/records",
  "/fields",
  "/team",
  "/team/crew",
  "/worker",
  "/h2a",
  "/h2a/housing",
  "/offline",
]);

export default function PwaRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !navigator.onLine ||
      !CACHEABLE.has(pathname)
    ) return;

    void navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({ type: "CACHE_SHELL", path: pathname });
      })
      .catch(() => {});
  }, [pathname]);

  return null;
}
