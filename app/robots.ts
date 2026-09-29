import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/records",
        "/fields",
        "/team",
        "/worker",
        "/h2a",
        "/integrations/",
        "/share/",
        "/mfa",
        "/offline",
      ],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://farmvoicerecords.com"}/sitemap.xml`,
  };
}
