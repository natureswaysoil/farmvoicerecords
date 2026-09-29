import Link from "next/link";
import { stateResources } from "@/src/lib/resources";
export default function TemplatePage() {
  return (
    <main className="container section stack">
      <h1>Pesticide application record template</h1>
      <p>
        Keep application details together: applicator, certification, date,
        product, EPA registration number, total amount and units, crop, location
        and area treated.
      </p>
      <a className="btn" href="/samples/pesticide-record.pdf">
        Download the fictional sample PDF
      </a>
      <section className="card">
        <h2>Check current requirements</h2>
        <p>
          USDA removed 7 CFR Part 110 effective July 11, 2025. Do not rely on
          its old deadlines as a universal current rule. State laws, product
          labels and worker-protection requirements still need review for your
          operation.
        </p>
        <a href="https://www.govinfo.gov/content/pkg/FR-2025-05-12/pdf/2025-08160.pdf">
          USDA final rule, May 12, 2025
        </a>
      </section>
      <h2>State resources</h2>
      <ul>
        {Object.entries(stateResources).map(([slug, r]) => (
          <li key={slug}>
            <Link href={`/resources/pesticide-records/${slug}`}>{r.name}</Link>
          </li>
        ))}
      </ul>
      <p>
        FarmVoice retains a legacy field-completeness checklist to help organize
        records. It does not certify compliance or file reports with an agency.
      </p>
      <Link href="/demo">See how voice becomes suggested fields</Link>
    </main>
  );
}
