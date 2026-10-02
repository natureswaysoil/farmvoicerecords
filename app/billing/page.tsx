import Link from "next/link";
import BillingControls from "@/src/components/billing-controls";
export default function BillingPage() {
  return (
    <main className="container section stack">
      <div className="kicker">Simple farm pricing</div>
      <h1>Start with records. Add H-2A when you need it.</h1>
      <p className="lede">
        14-day trial with no card required, starting when your farm is created.
        Unlimited workers. Existing records remain available to view and export
        after your trial.
      </p>
      <div className="grid-2">
        <section className="card stack">
          <h2>FarmVoice Core</h2>
          <div className="price">
            $49 <small>/month per farm</small>
          </div>
          <p>Or $490/year — two months free.</p>
          <p>
            Pesticide and purchase records, English/Spanish voice capture,
            suggested fields, field history, offline record queue, scheduling,
            GPS time, one-phone crew records, Ask FarmVoice, inspection
            packages, evidence, PDF/CSV reports and QuickBooks individual-time
            export.
          </p>
          <p>
            100 GB of farm photo and document storage included. Additional
            storage requires an agreed plan through support. Uploads pause at
            your allowance; no automatic overage charges.
          </p>
          <Link className="btn" href="/signup">
            Start 14-day free trial
          </Link>
        </section>
        <section className="card stack">
          <h2>H-2A workforce and housing</h2>
          <div className="price">
            +$149 <small>/month per farm</small>
          </div>
          <p>Or +$1,490/year. Requires Core.</p>
          <p>
            Add contracts, crew records, housing assignments, inspections,
            documents, payroll worksheets and audit exports. Included during the
            initial trial.
          </p>
        </section>
      </div>
      <BillingControls />
      <p>
        Cancel through Manage billing. Annual plans are billed annually. Records
        support your review; they do not certify legal compliance. AI requests
        are limited to 30 per user per hour.
      </p>
    </main>
  );
}
