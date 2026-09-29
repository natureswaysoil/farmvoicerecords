export default function InspectorDemo() {
  return (
    <main className="container section stack">
      <h1>Sample inspector packet</h1>
      <p>
        Fictional, read-only demonstration. No customer data is exposed here.
      </p>
      <section className="card">
        <h2>North Field — example farm</h2>
        <dl>
          <dt>Record status</dt>
          <dd>Draft — missing certification and EPA registration numbers</dd>
          <dt>Recorded</dt>
          <dd>September 20, 2026</dd>
          <dt>Application</dt>
          <dd>Example Product · 2 gallons · 4 acres of corn</dd>
          <dt>Reviewed by</dt>
          <dd>Not yet reviewed</dd>
        </dl>
        <a href="/samples/pesticide-record.pdf">Download sample packet</a>
      </section>
    </main>
  );
}
