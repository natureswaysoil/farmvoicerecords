import Link from "next/link";

export default function BillingPage() {
  return (
    <main className="container section">
      <div className="kicker">Simple farm pricing</div>
      <h2>Every FarmVoice feature. One farm plan.</h2>
      <p className="lede">
        Try FarmVoice free for 14 days with no credit card required. Then keep your entire farm team on one simple monthly plan.
      </p>

      <div className="card stack" style={{ maxWidth: 620, margin: "28px auto 0" }}>
        <div>
          <span className="badge">FarmVoice Complete</span>
          <div className="price">
            $49
            <span className="muted" style={{ fontSize: 16 }}>/month per farm</span>
          </div>
        </div>
        <strong>Unlimited workers</strong>
        <p className="muted">
          Includes farm and field records, scheduling, GPS timekeeping, Smart Photo Evidence,
          pesticide recordkeeping, USDA/FSA field tools, H-2A workforce and housing records,
          payroll preparation, QuickBooks integration, Help Center, and FarmVoice support.
        </p>
        <p className="muted">
          100 GB of farm photo and document storage is included. Additional storage may require an extra storage plan.
        </p>
        <Link className="btn" href="/signup">Start 14-day free trial</Link>
      </div>

      <p className="muted" style={{ marginTop: 24, textAlign: "center" }}>
        Cancel anytime. <Link href="/integrations/quickbooks">Connect QuickBooks</Link> to send approved employee time directly from FarmVoice.
      </p>
    </main>
  );
}
