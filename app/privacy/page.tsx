import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | FarmVoice Records",
  description: "FarmVoice Records privacy policy.",
};

export default function PrivacyPage() {
  return (
    <main className="container section stack">
      <div>
        <div className="kicker">Legal</div>
        <h1>Privacy Policy</h1>
        <p className="muted">Effective September 25, 2026</p>
      </div>

      <section className="card stack">
        <p>
          FarmVoice Records is operated by Nature&apos;s Way Soil &amp; Vermicompost LLC
          (&quot;FarmVoice,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). This policy
          explains what information we collect, why we use it, and the choices available to you
          when you use farmvoicerecords.com and related FarmVoice services.
        </p>

        <h2>Information we collect</h2>
        <p>
          We may collect account information such as your email address, farm membership,
          employee number, and role. We also process information you choose to enter or record,
          including farm records, field information, schedules, job details, pesticide and input
          records, notes, photos, time entries, approval status, and other operational records.
        </p>
        <p>
          When you use GPS-enabled features, FarmVoice may collect latitude, longitude,
          estimated accuracy, and the time of the location reading. GPS is captured only when a
          feature requests it, such as a record capture, clock-in, or clock-out. FarmVoice does
          not use continuous background employee tracking.
        </p>

        <h2>QuickBooks Online</h2>
        <p>
          If a farm owner chooses to connect QuickBooks Online, FarmVoice uses Intuit&apos;s
          authorization process to obtain permission to access the connected QuickBooks company.
          We do not ask for or store your QuickBooks password. We may store the connected company
          identifier, company name, authorization tokens, employee mappings, synchronization
          status, and identifiers returned by QuickBooks. Authorization tokens are stored
          server-side and encrypted before database storage.
        </p>
        <p>
          FarmVoice sends only the information required for the selected integration workflow,
          such as approved employee time, work date, duration, employee mapping, and job or field
          description. Detailed GPS coordinates and farm compliance records are not intentionally
          sent to QuickBooks as part of the approved-time synchronization workflow.
        </p>

        <h2>How we use information</h2>
        <p>
          We use information to provide and secure the service, authenticate users, maintain farm
          records, support scheduling and timekeeping, prepare payroll-ready information, connect
          requested third-party services, process subscriptions, troubleshoot problems, prevent
          abuse, and improve FarmVoice.
        </p>

        <h2>Service providers</h2>
        <p>
          FarmVoice uses service providers to operate the application. Depending on the feature
          you use, these may include hosting and deployment providers, database and authentication
          providers, email delivery providers, payment processors, and connected services such as
          Intuit QuickBooks Online. These providers process information only as needed to provide
          their services and are subject to their own privacy and security terms.
        </p>

        <h2>Payments</h2>
        <p>
          If FarmVoice enables online subscription payments, they may be processed by Stripe or
          another payment processor. FarmVoice does not intentionally store full payment-card
          numbers in its application database. Payment information submitted to a payment
          processor is handled under that provider&apos;s own terms and privacy practices.
        </p>

        <h2>Data retention</h2>
        <p>
          We retain account and farm records for as long as needed to provide the service, meet
          legitimate business and legal obligations, resolve disputes, and enforce agreements.
          Retention periods may vary by record type. Farm owners are responsible for keeping any
          records they are legally required to preserve independently of FarmVoice.
        </p>

        <h2>Your choices</h2>
        <p>
          You may choose not to grant microphone, camera, or location permission, although some
          features may be limited. A farm owner can disconnect QuickBooks Online from the
          FarmVoice QuickBooks integration page and can contact us for assistance with account or
          farm-data requests. Disconnecting removes FarmVoice's stored connection and stops future
          synchronization, but it does not delete information already sent to QuickBooks.
        </p>

        <h2>Security</h2>
        <p>
          We use administrative, technical, and organizational safeguards designed to protect
          information. No internet service can guarantee absolute security, and users should
          protect their sign-in links, devices, and connected accounts.
        </p>

        <h2>Children</h2>
        <p>
          FarmVoice is intended for business and farm operations and is not directed to children
          under 13.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as FarmVoice changes. The effective date at the top of this
          page will be updated when material revisions are posted.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy or privacy requests may be sent to{" "}
          <a href="mailto:natureswaysoil@gmail.com">natureswaysoil@gmail.com</a>.
        </p>

        <p className="muted">
          See also the <Link href="/terms">FarmVoice Records Terms of Use and End-User License Agreement</Link>.
        </p>
      </section>
    </main>
  );
}
