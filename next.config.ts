import type { NextConfig } from "next";
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "https://*.supabase.co";
const socketOrigin = supabaseOrigin.replace(/^http/, "ws");
const mediaOrigin = process.env.NEXT_PUBLIC_VIDEO_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_VIDEO_BASE_URL).origin
  : "";
const tourOrigin = process.env.NEXT_PUBLIC_FARMVOICE_TOUR_VIDEO_URL
  ? new URL(process.env.NEXT_PUBLIC_FARMVOICE_TOUR_VIDEO_URL).origin
  : "";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live https://*.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${supabaseOrigin} ${socketOrigin} https://vitals.vercel-insights.com https://*.stripe.com https://*.link.com https://vercel.live`,
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  `media-src 'self' blob: ${mediaOrigin}`,
  "font-src 'self' data:",
  `frame-src 'self' blob: https://*.stripe.com https://*.link.com https://vercel.live ${tourOrigin}`,
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }];
  },
};
export default nextConfig;
