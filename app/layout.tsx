import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FarmVoice Records",
  description: "Voice-first farm records, labor scheduling, GPS time and payroll preparation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <div className="container nav-inner">
            <Link className="brand" href="/">FarmVoice Records</Link>
            <nav className="nav-links" aria-label="Main navigation">
              <Link href="/records">Field records</Link>
              <Link href="/fields">Fields</Link>
              <Link href="/team">Team</Link>
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
            FarmVoice Records · Review pesticide records against the product label and applicable law before relying on them for compliance.{" "}
            <Link className="footer-link" href="/privacy">Privacy</Link> · <Link className="footer-link" href="/terms">Terms</Link> · <Link className="footer-link" href="/support">Support</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
