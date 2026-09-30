import Link from "next/link";
import { notFound } from "next/navigation";
import { stateResources } from "@/src/lib/resources";
export function generateStaticParams() {
  return Object.keys(stateResources).map((state) => ({ state }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const r = stateResources[(await params).state];
  return {
    title: r
      ? `${r.name} pesticide recordkeeping resources`
      : "Resource not found",
    description: r?.summary,
  };
}
export default async function StatePage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const r = stateResources[(await params).state];
  if (!r) notFound();
  return (
    <main className="container section stack">
      <h1>{r.name} pesticide recordkeeping</h1>
      <p className="lede">{r.summary}</p>
      <section className="card stack">
        <h2>Prepare your application record</h2>
        <p>
          Capture the date, applicator and certification details, product and
          EPA number, total amount and units, crop, location and area treated.
          Add any label, state and worker-protection details required for the
          application.
        </p>
        <a href={r.url}>Official {r.name} guidance</a>
        <p>
          Links reviewed September 30, 2026. The app's completeness checks are a
          recordkeeping aid, not a state-specific legal determination.
        </p>
        <Link href="/resources/pesticide-record-template">
          Download a sample record
        </Link>
        <Link className="btn" href="/signup">
          Start free trial
        </Link>
      </section>
    </main>
  );
}
