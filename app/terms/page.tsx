import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use & EULA | FarmVoice Records",
  description: "FarmVoice Records terms of use and end-user license agreement.",
};

export default function TermsPage() {
  return (
    <main className="container section stack">
      <div>
        <div className="kicker">Legal</div>
        <h1>Terms of Use &amp; End-User License Agreement</h1>
        <p className="muted">Effective September 25, 2026</p>
      </div>

      <section className="card stack">
        <p>
          These Terms of Use and End-User License Agreement (&quot;Terms&quot;) govern your use of
          FarmVoice Records, operated by Nature&apos;s Way Soil &amp; Vermicompost LLC
          (&quot;FarmVoice,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By creating
          an account, joining a farm, purchasing a subscription, or using FarmVoice, you agree to
          these Terms.
        </p>

        <h2>License</h2>
        <p>
          Subject to these Terms and any applicable subscription, FarmVoice grants you a limited,
          non-exclusive, non-transferable, revocable license to access and use FarmVoice for your
          own lawful farm or business operations. FarmVoice and its software, branding, and
          proprietary materials remain owned by FarmVoice or its licensors.
        </p>

        <h2>Accounts and authorized users</h2>
        <p>
          You are responsible for using accurate account information and protecting access to your
          email and devices. Farm owners are responsible for deciding who may join their farm and
          for removing access when it is no longer appropriate. Do not share sign-in links or use
          another person&apos;s account without authorization.
        </p>

        <h2>Farm records and compliance</h2>
        <p>
          FarmVoice is a recordkeeping and workflow tool. It does not provide legal, tax,
          accounting, pesticide-label, agronomic, payroll, or regulatory advice. You are
          responsible for reviewing records for accuracy and for complying with pesticide labels,
          employment laws, tax rules, record-retention requirements, and other laws applicable to
          your operation.
        </p>
        <p>
          Automated organization, transcription, extraction, validation, reminders, and
          completeness checks may contain errors or omit information. Do not rely on an automated
          result without reviewing the underlying facts.
        </p>

        <h2>GPS, timekeeping, and employee use</h2>
        <p>
          GPS readings are estimates and may be unavailable or inaccurate. FarmVoice captures
          location only when a user initiates a supported GPS event, such as clock-in or clock-out;
          it is not designed for continuous background tracking. Farm owners are responsible for
          giving any notices and obtaining any permissions required by employment or privacy law.
        </p>
        <p>
          FarmVoice records elapsed time and approval status but does not determine wages,
          overtime eligibility, required breaks, payroll taxes, or other compensation obligations.
          Owners must review approved hours before payroll is processed.
        </p>

        <h2>QuickBooks Online integration</h2>
        <p>
          If you connect QuickBooks Online, you authorize FarmVoice to exchange information with
          the QuickBooks company you select within the permissions approved through Intuit. You
          remain responsible for reviewing synchronized data before using it for payroll,
          accounting, tax reporting, or other financial decisions.
        </p>
        <p>
          A farm owner can disconnect QuickBooks from the FarmVoice QuickBooks integration page.
          Disconnecting removes FarmVoice's stored QuickBooks connection and employee mappings and
          stops future FarmVoice synchronization until the farm reconnects. It does not
          automatically delete records already created in QuickBooks.
        </p>

        <h2>Subscriptions and billing</h2>
        <p>
          FarmVoice may offer paid subscription plans. Current plan descriptions and prices may be
          displayed on the pricing page. Until an online checkout and subscription-management flow
          is made available, any paid subscription, renewal, cancellation, tax, or refund terms
          will be communicated to the customer before a charge is accepted. When online payment
          processing becomes available, it may be provided by Stripe or another payment processor.
        </p>

        <h2>Acceptable use</h2>
        <p>
          You may not use FarmVoice to violate law, access another farm without authorization,
          interfere with the service, attempt to bypass security controls, introduce malicious
          code, reverse engineer protected portions of the service except where law expressly
          permits it, or use FarmVoice to infringe the rights of others.
        </p>

        <h2>Your data</h2>
        <p>
          You retain your rights in the information you submit to FarmVoice. You grant FarmVoice
          permission to host, process, transmit, back up, and display that information as needed
          to provide and secure the service and the integrations you choose.
        </p>

        <h2>Third-party services</h2>
        <p>
          FarmVoice may interoperate with third-party services such as Intuit QuickBooks Online,
          Stripe, email providers, hosting providers, and database services. Third-party services
          are governed by their own terms and may change or discontinue functionality. FarmVoice
          is not responsible for outages or changes controlled by those third parties.
        </p>

        <h2>Availability and changes</h2>
        <p>
          We may modify, improve, suspend, or discontinue features. We aim to provide reliable
          service but do not guarantee uninterrupted or error-free availability.
        </p>

        <h2>Disclaimer of warranties</h2>
        <p>
          To the maximum extent permitted by law, FarmVoice is provided &quot;as is&quot; and
          &quot;as available&quot; without warranties of any kind, express or implied, including
          warranties of merchantability, fitness for a particular purpose, non-infringement, or
          that the service will satisfy every regulatory or recordkeeping requirement.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, FarmVoice and Nature&apos;s Way Soil &amp;
          Vermicompost LLC will not be liable for indirect, incidental, special, consequential,
          exemplary, or punitive damages, or for lost profits, lost data, payroll errors,
          compliance penalties, or business interruption arising from use of the service. Where
          liability cannot be excluded, our aggregate liability will not exceed the amount you
          paid to FarmVoice for the service during the twelve months before the event giving rise
          to the claim.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using FarmVoice at any time. We may suspend or terminate access for
          material breach of these Terms, unlawful use, security risk, nonpayment, or conduct that
          threatens the service or other users. Provisions that by their nature should survive
          termination will continue to apply.
        </p>

        <h2>Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of North Carolina, without regard to
          conflict-of-law rules, except where applicable law requires otherwise.
        </p>

        <h2>Changes to these Terms</h2>
        <p>
          We may update these Terms as FarmVoice changes. Material changes will be posted with a
          revised effective date. Continued use after the effective date of revised Terms means
          you accept the updated Terms to the extent permitted by law.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these Terms may be sent to{" "}
          <a href="mailto:natureswaysoil@gmail.com">natureswaysoil@gmail.com</a>.
        </p>

        <p className="muted">
          See also the <Link href="/privacy">FarmVoice Records Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
