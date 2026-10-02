import type { Metadata } from "next";
import Link from "next/link";
import { guideVideos } from "@/src/lib/videos";

export const metadata: Metadata = {
  title: "FarmVoice Records — Farm paperwork without the paperwork",
  description:
    "Voice-first farm records, pesticide documentation, crew scheduling, GPS time, payroll preparation, QuickBooks, Ask FarmVoice, Farm Map, and H-2A workforce and housing records.",
  openGraph: {
    title: "FarmVoice Records — Farm paperwork without the paperwork",
    description:
      "Speak the work once. Turn it into reviewed farm records, crew time, H-2A documentation, payroll-ready records and inspection packages.",
  },
};

const workflow = [
  {
    step: "01",
    title: "Speak or enter the work",
    body: "Capture field work, pesticide applications, purchases, crew notes and job details while the information is still fresh.",
    href: "/records",
    link: "Open Field records",
  },
  {
    step: "02",
    title: "Review before it becomes a record",
    body: "FarmVoice suggests structured fields, but you review the values, dates, fields, photos and evidence before saving.",
    href: "/demo",
    link: "See a sample record",
  },
  {
    step: "03",
    title: "Connect the field, crew and time",
    body: "Schedule work, capture GPS-supported time, use one phone for a crew, and keep work tied to the right farm and field.",
    href: "/team",
    link: "Explore Team & time",
  },
  {
    step: "04",
    title: "Find what needs attention",
    body: "Ask FarmVoice can surface incomplete farm records, crew-hour summaries, field activity and H-2A records needing review.",
    href: "/ask-farmvoice",
    link: "Open Ask FarmVoice",
  },
  {
    step: "05",
    title: "Export, prepare and hand off",
    body: "Prepare inspection packages, payroll-ready time, CSV/PDF records and QuickBooks-ready individual time.",
    href: "/inspection-package",
    link: "See inspection packages",
  },
];

const coreFeatures = [
  ["Voice-first records", "English and Spanish server transcription with reviewable suggested fields.", "/records"],
  ["Pesticide records", "Completeness checks, field history, evidence and inspection-package preparation.", "/resources/pesticide-record-template"],
  ["USDA/FSA fields", "Import supported field boundary files and keep field records connected to the right acreage.", "/fields/import"],
  ["Farm Map", "See fields, points of interest, work locations, routes and record-related map activity in one view.", "/map"],
  ["Crew scheduling & time", "Schedules, GPS-supported clock-in/out, approvals and one-phone crew records.", "/team"],
  ["Payroll & QuickBooks", "Review approved time, export payroll data and map individual worker time to QuickBooks Online.", "/integrations/quickbooks"],
  ["Smart Photo Evidence", "Attach private photos and supported PDFs directly to the record they support.", "/records"],
  ["Ask FarmVoice", "Query your existing records for incomplete work, field activity, hours and H-2A attention items.", "/ask-farmvoice"],
  ["Inspection packages", "Prepare a reviewable pesticide record package with printable output and CSV index.", "/inspection-package"],
];

const h2aFeatures = [
  "Incoming-worker onboarding checklist with required-now, due-later, complete and exception statuses",
  "Farm-level H-2A readiness checklist tied to the job order",
  "Contracts, worker roster, arrival dates and work-authorization tracking",
  "Daily crew records, hours offered/worked and piecework",
  "Housing properties, assignments, inspections, findings and corrective-action evidence",
  "Transportation, training, recruitment, separations and worker acknowledgments",
  "Payroll worksheets, wage history and three-fourths review support",
  "Private document vault, evidence attachments and H-2A audit exports",
  "Ask FarmVoice attention checks across worker, housing, documents and checklist records",
];

export default function HomePage() {
  const recordGuide = guideVideos.find((video) => video.slug === "records")!;

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div className="home-hero-copy">
            <div className="eyebrow">Farm records · Crew · Payroll · H-2A</div>
            <h1>Farm paperwork without the paperwork.</h1>
            <p className="lede">
              Speak the work once. FarmVoice helps turn it into reviewed farm
              records, field history, crew time, payroll-ready information,
              H-2A documentation and inspection-ready exports.
            </p>
            <div className="actions">
              <Link className="btn home-primary-cta" href="/signup">
                Start 14-day free trial
              </Link>
              <Link className="btn secondary" href="/demo">
                See FarmVoice in action
              </Link>
            </div>
            <div className="home-trust-row" aria-label="Plan highlights">
              <span>Core $49/month</span>
              <span>Unlimited workers</span>
              <span>100 GB included</span>
              <span>No card for trial</span>
            </div>
            <p className="small muted">
              H-2A workforce and housing is an optional $149/month add-on.
              Records support your review; FarmVoice does not certify legal
              compliance.
            </p>
          </div>

          <div className="home-hero-panel">
            <div className="home-hero-panel-head">
              <div>
                <div className="kicker">One farm workspace</div>
                <h2>From field work to records you can use</h2>
              </div>
              <span className="badge">Built for real farm workflows</span>
            </div>
            <div className="home-mini-flow">
              {[
                ["Speak", "Field work & notes"],
                ["Review", "Suggested structured fields"],
                ["Connect", "Fields · crew · GPS · evidence"],
                ["Use", "Payroll · H-2A · exports · QuickBooks"],
              ].map(([label, detail]) => (
                <div className="home-mini-flow-row" key={label}>
                  <strong>{label}</strong>
                  <span>{detail}</span>
                </div>
              ))}
            </div>
            <div className="home-hero-video">
              <video
                controls
                playsInline
                preload="metadata"
                aria-label="FarmVoice field-record walkthrough"
              >
                <source src={recordGuide.src} type="video/mp4" />
              </video>
            </div>
            <Link className="home-text-link" href="/help">
              View Help Center and walkthroughs →
            </Link>
          </div>
        </div>
      </section>

      <section className="container home-outcome-strip" aria-label="FarmVoice outcomes">
        <div>
          <strong>Less duplicate entry</strong>
          <span>Capture work once, then reuse the reviewed record.</span>
        </div>
        <div>
          <strong>Fewer loose records</strong>
          <span>Keep fields, workers, photos, documents and history together.</span>
        </div>
        <div>
          <strong>Faster review</strong>
          <span>Surface incomplete records and attention items before they pile up.</span>
        </div>
      </section>

      <section className="container section home-section">
        <div className="home-section-head">
          <div>
            <div className="kicker">How FarmVoice works</div>
            <h2>One workflow from the field to the office</h2>
          </div>
          <p>
            FarmVoice is designed around the work you already do—not around
            forcing every worker to become a software user.
          </p>
        </div>
        <div className="home-workflow">
          {workflow.map((item) => (
            <article className="home-workflow-card" key={item.step}>
              <span className="home-step">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <Link href={item.href}>{item.link} →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="home-band">
        <div className="container section home-section">
          <div className="home-section-head">
            <div>
              <div className="kicker">FarmVoice Core</div>
              <h2>Records, fields, crew and payroll in one farm system</h2>
            </div>
            <div>
              <div className="home-price-line">$49/month per farm</div>
              <p className="muted">Unlimited workers · $490/year</p>
            </div>
          </div>
          <div className="home-feature-grid">
            {coreFeatures.map(([title, body, href]) => (
              <article className="home-feature-card" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
                <Link href={href}>Explore →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container section home-section">
        <div className="home-h2a-spotlight">
          <div className="home-h2a-copy">
            <div className="kicker">H-2A workforce & housing add-on</div>
            <h2>From worker arrival to audit export.</h2>
            <p className="lede">
              FarmVoice now brings onboarding, farm readiness, daily crew
              records, housing, payroll worksheets, supporting evidence and
              document organization into one H-2A workspace.
            </p>
            <div className="actions">
              <Link className="btn" href="/h2a">
                Explore H-2A
              </Link>
              <Link className="btn secondary" href="/h2a/arrival">
                See arrival & readiness checklists
              </Link>
            </div>
            <p className="small muted">
              +$149/month per farm or +$1,490/year. Requires FarmVoice Core and
              is included during the initial trial.
            </p>
          </div>
          <div className="home-h2a-list">
            {h2aFeatures.map((feature) => (
              <div className="home-check-row" key={feature}>
                <span aria-hidden="true">✓</span>
                <p>{feature}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-ai-band">
        <div className="container section home-ai-grid">
          <div>
            <div className="kicker">Ask FarmVoice</div>
            <h2>Your records become searchable farm history.</h2>
            <p className="lede">
              Instead of hunting through screens and files, use FarmVoice to
              answer practical questions from the records already stored in
              your farm workspace.
            </p>
            <Link className="btn secondary" href="/ask-farmvoice">
              See Ask FarmVoice
            </Link>
          </div>
          <div className="home-question-list">
            {[
              "What farm records are incomplete?",
              "Show pesticide applications for this field.",
              "How many hours did my crew work?",
              "Show scheduled vs. actual hours.",
              "What H-2A records need attention?",
              "Summarize activity on this field.",
            ].map((question) => (
              <div className="home-question" key={question}>
                “{question}”
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container section home-section">
        <div className="home-section-head">
          <div>
            <div className="kicker">Designed for farm reality</div>
            <h2>Not every worker needs a phone.</h2>
          </div>
          <p>
            A supervisor or crew leader can maintain one-phone crew records.
            Workers who use the individual GPS clock can use their own account
            when clocking in and out.
          </p>
        </div>
        <div className="grid-3">
          <article className="card">
            <h3>One phone for a crew</h3>
            <p>
              Keep the worker roster and crew-day record together without
              requiring every worker to carry or manage an account.
            </p>
          </article>
          <article className="card">
            <h3>Offline-friendly workflows</h3>
            <p>
              Supported records and crew entries can be queued on-device and
              sent when connectivity returns.
            </p>
          </article>
          <article className="card">
            <h3>Private farm evidence</h3>
            <p>
              Photos, documents and sensitive H-2A records stay farm-scoped
              behind authenticated access controls.
            </p>
          </article>
        </div>
      </section>

      <section className="home-cta-band">
        <div className="container home-cta-grid">
          <div>
            <div className="kicker">Start with your next record</div>
            <h2>Try FarmVoice on the work you already do.</h2>
            <p>
              14 days free. No card required. Core includes unlimited workers
              and 100 GB of farm photo and document storage.
            </p>
          </div>
          <div className="actions">
            <Link className="btn" href="/signup">
              Start free trial
            </Link>
            <Link className="btn secondary" href="/billing">
              Compare pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="container section home-section">
        <div className="home-section-head">
          <div>
            <div className="kicker">See the product</div>
            <h2>Short FarmVoice walkthroughs</h2>
          </div>
          <Link href="/help">Open Help Center →</Link>
        </div>
        <div className="grid-3">
          {guideVideos.map((video) => (
            <article className="card stack home-video-card" key={video.slug}>
              <h3>{video.title}</h3>
              <video
                controls
                playsInline
                preload="none"
                aria-label={`${video.title} walkthrough`}
              >
                <source src={video.src} type="video/mp4" />
              </video>
              <Link href={video.prefix}>Open {video.title} →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="container section home-origin">
        <div>
          <div className="kicker">Built from farm work</div>
          <h2>Built around work on a North Carolina family farm.</h2>
        </div>
        <p>
          FarmVoice Records is operated by Nature’s Way Soil &amp; Vermicompost
          LLC. The goal is practical: capture work while it is fresh, review it,
          keep the evidence with it, and make the record useful later.
        </p>
      </section>
    </main>
  );
}
