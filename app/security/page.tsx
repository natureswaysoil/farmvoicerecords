import Link from "next/link";
export default function SecurityPage() {
  return (
    <main className="container section stack">
      <h1>Your farm records and account security</h1>
      <section className="card">
        <h2>Access follows your farm</h2>
        <p>
          Signed-in accounts and database row-level policies restrict access by
          farm membership and role. Private evidence uses access-controlled
          storage. QuickBooks tokens are encrypted on the server.
        </p>
        <h2>Protect your account</h2>
        <p>
          FarmVoice supports authenticator-based multi-factor authentication.
          Privileged H-2A operations require additional authentication checks.
        </p>
        <Link href="/mfa">Set up multi-factor authentication</Link>
        <h2>Voice and AI</h2>
        <p>
          When you request transcription or field suggestions, audio or note
          text is sent through Vercel AI Gateway to the configured AI provider.
          Suggestions require your review. Do not include passwords or unrelated
          personal information.
        </p>
        <h2>Offline devices</h2>
        <p>
          Queued records are stored in your browser under your account. They are
          not a cloud backup until delivery succeeds. Protect shared devices and
          export pending records before clearing browser data. Signing out hides
          the queue but does not delete it.
        </p>
        <h2>Payments</h2>
        <p>
          Stripe hosts checkout and payment management. FarmVoice does not
          collect card numbers.
        </p>
        <h2>Questions or security concerns</h2>
        <a href="mailto:james@farmvoicerecords.com">
          james@farmvoicerecords.com
        </a>
        <p>
          We do not claim a security certification or guarantee compliance. Read
          our <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/terms">Terms</Link>.
        </p>
      </section>
    </main>
  );
}
