import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FarmVoice Records",
    short_name: "FarmVoice",
    description: "Farm workforce, field records, GPS time and USDA field boundaries.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f6b3a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
    ],
    share_target: {
      action: "/share/usda",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "usdaFile", accept: [".zip", ".geojson", "application/zip", "application/geo+json", "application/json"] }],
      },
    },
  } as MetadataRoute.Manifest;
}
