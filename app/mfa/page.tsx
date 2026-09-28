"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function MfaPage() {
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function prepare() {
      const supabase = createClient();
      const params = new URL(window.location.href).searchParams;
      const requested = params.get("next");
      const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/records";

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.assign("/login?next=" + encodeURIComponent(next));
        return;
      }

      const { data: required, error: requiredError } = await supabase.rpc("requires_mfa_for_current_user");
      if (requiredError) {
        setMessage("FarmVoice could not verify your account security requirements.");
        return;
      }
      if (!required) {
        window.location.assign(next);
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        window.location.assign(next);
        return;
      }

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        setMessage(factorsError.message);
        return;
      }

      const verified = factors.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setReady(true);
        return;
      }

      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "FarmVoice Records",
      });
      if (enrollError) {
        setMessage(enrollError.message);
        return;
      }

      setFactorId(enrollment.id);
      setQr(enrollment.totp.qr_code);
      setSecret(enrollment.totp.secret);
      setEnrolling(true);
      setReady(true);
    }

    void prepare();
  }, []);

  async function verify(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setMessage(challengeError.message);
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (error) {
      setMessage("That code was not accepted. Check your authenticator app and try again.");
      return;
    }

    const params = new URL(window.location.href).searchParams;
    const requested = params.get("next");
    window.location.assign(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/records");
  }

  return (
    <main className="container section">
      <div className="card" style={{ maxWidth: 620, margin: "20px auto" }}>
        <div className="kicker">Account security</div>
        <h2>{enrolling ? "Set up two-factor authentication" : "Two-factor authentication"}</h2>
        {!ready && !message && <p className="muted">Checking your FarmVoice security settings…</p>}

        {ready && enrolling && (
          <>
            <p className="muted">
              Scan this QR code with your authenticator app, then enter the current 6-digit code.
            </p>
            {qr && <Image src={qr} alt="FarmVoice authenticator QR code" width={260} height={260} unoptimized />}
            {secret && (
              <p className="muted">
                Can&apos;t scan the code? Enter this setup key manually: <code>{secret}</code>
              </p>
            )}
          </>
        )}

        {ready && !enrolling && (
          <p className="muted">Enter the current 6-digit code from your authenticator app.</p>
        )}

        {ready && (
          <form className="form" onSubmit={verify}>
            <div className="field">
              <label htmlFor="mfa-code">6-digit code</label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <button className="btn" type="submit" disabled={code.length !== 6}>
              {enrolling ? "Enable two-factor authentication" : "Verify and continue"}
            </button>
          </form>
        )}

        {message && <p className="notice warn" style={{ marginTop: 14 }}>{message}</p>}
      </div>
    </main>
  );
}
