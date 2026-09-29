import Link from "next/link";
export default function DemoPage() {
  return (
    <main className="container section stack">
      <div className="kicker">Fictional example — no account required</div>
      <h1>From spoken note to a record you can review</h1>
      <section className="card stack">
        <h2>Original note</h2>
        <blockquote>
          On September 20, 2026, Alex Example applied 2 gallons of Example
          Product to 4 acres of corn in North Field.
        </blockquote>
        <h2>Suggested fields</h2>
        <dl>
          <dt>Applicator</dt>
          <dd>Alex Example</dd>
          <dt>Application date</dt>
          <dd>2026-09-20</dd>
          <dt>Product</dt>
          <dd>Example Product</dd>
          <dt>Total applied</dt>
          <dd>2 gallons</dd>
          <dt>Area and crop</dt>
          <dd>4 acres · corn</dd>
          <dt>Location</dt>
          <dd>North Field</dd>
        </dl>
        <div className="notice warn">
          Certification number and EPA registration number are missing. The app
          asks you to supply them; the AI does not invent them. You decide
          whether this is a restricted-use application.
        </div>
      </section>
      <p>
        This example is illustrative, not a real application or pesticide
        recommendation.
      </p>
      <div className="inline">
        <a className="btn secondary" href="/samples/pesticide-record.pdf">
          Sample pesticide record PDF
        </a>
        <a className="btn secondary" href="/samples/h2a-payroll.csv">
          Sample H-2A payroll worksheet CSV
        </a>
        <Link href="/demo/inspector">Sample inspector view</Link>
        <Link className="btn" href="/signup">
          Start free trial
        </Link>
      </div>
    </main>
  );
}
