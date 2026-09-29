export const guideVideos = [
  { prefix: "/h2a/housing", title: "H-2A housing", slug: "housing" },
  { prefix: "/h2a", title: "H-2A records", slug: "h2a" },
  {
    prefix: "/integrations/quickbooks",
    title: "QuickBooks",
    slug: "quickbooks",
  },
  { prefix: "/records", title: "Field records", slug: "records" },
  { prefix: "/fields", title: "Fields", slug: "fields" },
  { prefix: "/team", title: "Team and GPS time", slug: "team" },
].map((video) => ({
  ...video,
  src: `${(process.env.NEXT_PUBLIC_VIDEO_BASE_URL ?? "").replace(/\/$/, "")}/videos/farmvoice-${video.slug}.mp4`,
}));
