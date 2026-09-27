import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata: Metadata = {
  title: "FarmVoice Records",
  description: "Voice-first farm records, labor scheduling, GPS time and payroll preparation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <header className="nav">
          <div className="container nav-inner">
            <Link className="brand" href="/">FarmVoice Records</Link>
            <nav className="nav-links" aria-label="Main navigation">
              <Link href="/records">Field records</Link>
              <Link href="/fields">Fields</Link>
              <Link href="/team">Team</Link>
              <Link href="/h2a">H-2A</Link>
              <Link href="/integrations/quickbooks">QuickBooks</Link>
              <Link href="/join">Join farm</Link>
              <Link href="/billing">Pricing</Link>
              <Link href="/support">Support</Link>
              <Link className="btn" href="/login">Sign in</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="footer">
          <div className="container">
            FarmVoice Records does not guarantee the accuracy or completeness of records, reports, calculations, payroll information, or compliance data. Users are responsible for reviewing and verifying all information before relying on it. Always verify pesticide records against the product label and applicable law.{" "}
            <Link className="footer-link" href="/privacy">Privacy</Link> · <Link className="footer-link" href="/terms">Terms</Link> · <Link className="footer-link" href="/support">Support</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
