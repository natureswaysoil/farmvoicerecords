import AuthNavigation from "@/src/components/auth-navigation";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import PwaRegister from "./pwa-register";
import FarmVoiceHelpShell from "@/src/components/farmvoice-help-shell";
import SectionVideoHelp from "@/src/components/section-video-help";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://farmvoicerecords.com",
  ),
  title: {
    default: "FarmVoice Records — Farm recordkeeping by voice",
    template: "%s | FarmVoice Records",
  },
  openGraph: {
    title: "FarmVoice Records",
    description:
      "Speak, review and organize pesticide, purchase and workforce records.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  description:
    "Voice-first farm records, labor scheduling, GPS time and payroll preparation.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <Analytics />
        <FarmVoiceHelpShell />
        <SectionVideoHelp />
        <header className="nav">
          <div className="container nav-inner">
            <Link className="brand" href="/">
              FarmVoice Records
            </Link>
            <AuthNavigation />
          </div>
        </header>
        {children}
        <footer className="footer">
          <div className="container">
            FarmVoice Records · Farm records, reviewed by you.{" "}
            <Link className="footer-link" href="/privacy">
              Privacy
            </Link>{" "}
            ·{" "}
            <Link className="footer-link" href="/terms">
              Terms
            </Link>{" "}
            ·{" "}
            <Link className="footer-link" href="/help">
              Help & FAQ
            </Link>{" "}
            ·{" "}
            <Link className="footer-link" href="/support">
              Support
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
