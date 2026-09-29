import Link from "next/link";
export default function PayrollResource() {
  return (
    <main className="container section stack">
      <h1>H-2A payroll recordkeeping</h1>
      <p>
        Bring contracts, daily hours offered and worked, pay rates, piecework
        details and deductions together before payroll review.
      </p>
      <section className="card">
        <h2>Keep the source records</h2>
        <p>
          A payroll worksheet is a review aid. Verify the applicable contract,
          wage requirements and deductions before paying workers. FarmVoice
          exports do not submit payroll or replace professional review.
        </p>
        <a href="https://webapps.dol.gov/elaws/elg/taw.htm">
          U.S. Department of Labor recordkeeping guidance
        </a>
      </section>
      <a className="btn secondary" href="/samples/h2a-payroll.csv">
        Download a fictional payroll worksheet CSV
      </a>
      <p>The sample uses an illustrative rate, not a wage determination.</p>
      <Link className="btn" href="/billing">
        Explore the H-2A add-on
      </Link>
    </main>
  );
}
