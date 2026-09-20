import Link from "next/link";

const benefits = [
  ["Speak instead of type", "Record pesticide applications and farm input purchases while details are fresh."],
  ["Keep complete records", "Missing-field checks flag incomplete pesticide records instead of guessing."],
  ["Track labor accurately", "Workers can clock in and out with GPS, job details and manager review."],
  ["Know your true costs", "Track purchases by field and compare scheduled hours with actual time."],
  ["Plan the week", "Assign workers to dates, fields and jobs from one team workspace."],
  ["Prepare payroll", "Approve completed time and export approved hours as CSV."],
];

export default function HomePage() {
  return (
    <main>
      <section className="container hero">
        <div>
          <div className="eyebrow">Voice-first farm records</div>
          <h1>Speak your farm records. Keep your crew and costs organized.</h1>
          <p className="lede">Describe a pesticide application or input purchase in your own words. Review the organized record, save it, then manage worker scheduling, GPS time and payroll preparation in the same app.</p>
          <div className="actions">
            <Link className="btn" href="/records">Try a record</Link>
            <Link className="btn secondary" href="/billing">Start free trial</Link>
          </div>
        </div>
        <div className="card stack">
          <span className="badge">Today at a glance</span>
          <div><div className="stat">One team</div><div className="muted">Owners and workers</div></div>
          <div><div className="stat">One schedule</div><div className="muted">Jobs and fields</div></div>
          <div><div className="stat">GPS checks</div><div className="muted">Captured at record or time-clock events</div></div>
          <div><div className="stat">Approved time</div><div className="muted">Ready for payroll export</div></div>
        </div>
      </section>
      <section className="section"><div className="container"><div className="kicker">Why FarmVoice Records</div><h2>Less office work. Better farm records.</h2><div className="grid-3">{benefits.map(([title,body])=><article className="card" key={title}><h3>{title}</h3><p className="muted">{body}</p></article>)}</div></div></section>
      <section className="section"><div className="container grid-2">
        <div className="card"><span className="badge">1</span><h3>Speak or type a note</h3><p className="muted">Describe a purchase or pesticide application. Voice capture uses supported browser speech recognition, with typed notes as a fallback.</p></div>
        <div className="card"><span className="badge">2</span><h3>Review the details</h3><p className="muted">Check quantities, costs, dates, application details and any GPS reading. The app never invents missing compliance fields.</p></div>
        <div className="card"><span className="badge">3</span><h3>Save and organize</h3><p className="muted">Keep drafts when details are incomplete. Confirmed restricted-use pesticide records are blocked until federal baseline requirements are present.</p></div>
        <div className="card"><span className="badge">4</span><h3>Review and export</h3><p className="muted">Track scheduled versus actual hours, approvals, records and CSV exports.</p></div>
      </div></section>
    </main>
  );
}
