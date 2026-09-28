"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { safeNextPath } from "@/src/lib/safe-next";

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
      const next = safeNextPath(params.get("next"), window.location.origin);

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
        if (!next.startsWith("/join")) {
          const farmResponse = await fetch("/api/farm/ensure-owner", { method: "POST" });
          if (!farmResponse.ok) {
            setMessage("Two-factor authentication is active, but FarmVoice could not finish setting up your farm account. Please try again.");
            return;
          }
        }
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

      // Supabase creates an unverified factor as soon as enrollment starts. If
      // setup was abandoned, remove those stale factors before starting over.
      for (const factor of factors.all.filter(
        (item) => item.factor_type === "totp" && item.status === "unverified",
      )) {
        const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (cleanupError) {
          setMessage("FarmVoice could not restart two-factor setup. Please try again.");
          return;
        }
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

  async function restartEnrollment() {
    setMessage("");
    if (!factorId) return;
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setMessage("FarmVoice could not replace this authenticator setup. Please try again.");
      return;
    }
    window.location.reload();
  }

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

    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || aal.currentLevel !== "aal2") {
      setMessage("Two-factor authentication was verified, but FarmVoice could not confirm your secure session. Please try again.");
      return;
    }

    const params = new URL(window.location.href).searchParams;
    const next = safeNextPath(params.get("next"), window.location.origin);

    if (!next.startsWith("/join")) {
      const farmResponse = await fetch("/api/farm/ensure-owner", { method: "POST" });
      if (!farmResponse.ok) {
        setMessage("Two-factor authentication succeeded, but FarmVoice could not finish setting up your farm account. Please try again.");
        return;
      }
    }

    window.location.assign(next);
  }

  return (
    <main className="container section">
      <div className="card" style={{ maxWidth: 620, margin: "20px auto" }}>
        <div className="kicker">Account security</div>
        <h2>{enrolling ? "Set up two-factor authentication" : "Two-factor authentication"}</h2>
        {!ready && !message && <p className="muted">Checking your FarmVoice security settings…</p>}

        {ready && enrolling && (
          <>
            <div className="notice">
              <strong>Choose either setup method</strong>
              <p><strong>Option 1 — Scan:</strong> Open Google Authenticator, Microsoft Authenticator, Authy, 1Password, or another TOTP authenticator. Tap <strong>+ / Add account → Scan QR code</strong>, then scan the FarmVoice QR below.</p>
              <p><strong>Option 2 — Enter the setup key:</strong> In the authenticator app choose <strong>Enter setup key / Enter code manually</strong>, then enter the FarmVoice setup key shown under the QR.</p>
              <p style={{ marginBottom: 0 }}>After either method, your authenticator will show a new <strong>FarmVoice Records</strong> rotating 6-digit number. Type that 6-digit number into the box below.</p>
            </div>
            {qr && <Image src={qr} alt="FarmVoice authenticator QR code" width={260} height={260} unoptimized />}
            {secret && (
              <details className="notice" style={{ marginTop: 12 }}>
                <summary><strong>Use setup key instead of scanning</strong></summary>
                <p className="small" style={{ marginTop: 10 }}>
                  Enter this key into your authenticator app. Keep it private: this is a permanent security secret, not the rotating 6-digit login code.
                </p>
                <code style={{ overflowWrap: "anywhere" }}>{secret}</code>
              </details>
            )}
            <div className="notice warn" style={{ marginTop: 12 }}>
              <strong>If this QR code or setup key was exposed, replace it before continuing.</strong>
              <p>This creates a fresh FarmVoice authenticator secret.</p>
              <button className="btn secondary" type="button" onClick={() => void restartEnrollment()}>
                Generate a new QR code
              </button>
            </div>
          </>
        )}

        {ready && !enrolling && (
          <p className="muted">Enter the current 6-digit code from your authenticator app.</p>
        )}

        {ready && (
          <form className="form" onSubmit={verify}>
            <div className="field">
              <label htmlFor="mfa-code">{enrolling ? "Enter the 6-digit number now shown for FarmVoice Records" : "Enter the current FarmVoice Records 6-digit number"}</label>
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
