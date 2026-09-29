import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://farmvoicerecords.com";
  return [
    "",
    "/billing",
    "/help",
    "/support",
    "/security",
    "/privacy",
    "/terms",
    "/demo",
    "/resources/pesticide-record-template",
    "/resources/h2a-payroll-recordkeeping",
    ...["nc", "ga", "fl", "ca"].map((s) => `/resources/pesticide-records/${s}`),
  ].map((path) => ({ url: origin + path }));
}
