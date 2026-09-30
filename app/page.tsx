import Link from "next/link";
import { guideVideos } from "@/src/lib/videos";
export default function HomePage() {
  const recordGuide = guideVideos.find((v) => v.slug === "records")!;
  return (
    <main>
      <section className="container hero">
        <div>
          <div className="eyebrow">Farm records, ready for your review</div>
          <h1>Farm recordkeeping that starts with your voice.</h1>
          <p className="lede">
            Speak your field notes in English or Spanish. Review your records,
            attach photos, and have your crew paperwork ready. One supervisor
            can record the crew from one phone.
          </p>
          <div className="actions">
            <Link className="btn" href="/signup">
              Start free trial
            </Link>
            <Link className="btn secondary" href="/demo">
              See a sample record
            </Link>
          </div>
          <p>
            Core $49/month · Unlimited workers · 14-day trial, no card required
          </p>
        </div>
        <div className="card stack">
          <span className="badge">Watch the field-record guide</span>
          <video
            controls
            playsInline
            preload="none"
            style={{ width: "100%" }}
            aria-label="Field records walkthrough"
          >
            <source src={recordGuide.src} type="video/mp4" />
          </video>
          <p className="small">
            A short introduction to the record workflow. Review all suggested
            values before saving.
          </p>
        </div>
      </section>
      <section className="container section grid-3">
        {[
          [
            "Speak and review",
            "Server transcription supports English and Spanish. Field suggestions retain evidence from your original note.",
          ],
          [
            "One phone for your crew",
            "Record a roster without worker phones or accounts. Save crew entries on your device and send them online for owner review.",
          ],
          [
            "Organize H-2A records",
            "Keep workforce, housing, payroll worksheets and supporting documents in one farm workspace.",
          ],
        ].map(([title, body]) => (
          <article className="card" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className="container section stack">
        <h2>Built around work on a North Carolina family farm</h2>
        <p>
          FarmVoice is operated by Nature’s Way Soil &amp; Vermicompost LLC. The
          goal is practical: capture work while it is fresh, review it, and keep
          the evidence together.
        </p>
        <h2>See what your records look like</h2>
        <div className="inline">
          <Link href="/demo">Sample record and inspector view</Link>
          <Link href="/resources/pesticide-record-template">
            Pesticide record template
          </Link>
          <Link href="/resources/h2a-payroll-recordkeeping">
            H-2A payroll recordkeeping
          </Link>
          <Link href="/security">Data security and MFA</Link>
        </div>
        <p>
          H-2A workforce and housing is a separate add-on: $149/month plus Core,
          $198/month total. <Link href="/billing">Compare plans</Link>.
        </p>
        <h2>Six short walkthroughs</h2>
        <div className="grid-3">
          {guideVideos.map((v) => (
            <article className="card stack" key={v.slug}>
              <h3>{v.title}</h3>
              <video
                controls
                playsInline
                preload="none"
                style={{ width: "100%" }}
                aria-label={`${v.title} walkthrough`}
              >
                <source src={v.src} type="video/mp4" />
              </video>
              <Link href={v.prefix}>Open {v.title}</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
