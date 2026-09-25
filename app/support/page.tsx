import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support | FarmVoice Records",
  description: "Contact FarmVoice Records support.",
};

export default function SupportPage() {
  return (
    <main className="container section stack">
      <div>
        <div className="kicker">Help</div>
        <h1>FarmVoice Support</h1>
        <p className="muted">
          Contact us for help with FarmVoice, QuickBooks connections, employee mappings,
          time synchronization, billing questions, or account access.
        </p>
      </div>

      <section className="card stack">
        <h2>Email support</h2>
        <p>
          Email <a href="mailto:natureswaysoil@gmail.com">natureswaysoil@gmail.com</a>.
        </p>
        <p className="muted">
          For QuickBooks issues, include the approximate time of the problem and any Intuit
          request ID shown in FarmVoice. Never send your QuickBooks password, Client Secret,
          access token, or refresh token.
        </p>
      </section>

      <section className="card stack">
        <h2>QuickBooks troubleshooting</h2>
        <p className="muted">
          Farm owners can open the QuickBooks integration page to reconnect QuickBooks,
          review synchronization status, and view recent troubleshooting references.
        </p>
        <p>
          <a className="btn secondary" href="/integrations/quickbooks">
            Open QuickBooks integration
          </a>
        </p>
      </section>
    </main>
  );
}
