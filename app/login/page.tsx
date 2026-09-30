"use client";
import { useAuthLanguage } from "@/src/lib/auth-copy";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { safeNextPath } from "@/src/lib/safe-next";

export default function LoginPage() {
  const { es, t, toggle } = useAuthLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const error = new URL(window.location.href).searchParams.get("error");
    if (error === "farm_setup_failed") {
      setMessage(
        t(
          "Your email was confirmed, but FarmVoice could not finish setting up the farm account. Sign in again to retry.",
        ),
      );
    } else if (error === "confirmation_invalid") {
      setMessage(
        t(
          "That confirmation link is invalid or expired. Request a new confirmation or password setup link.",
        ),
      );
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(
          t(
            "Email or password is incorrect. If you previously used email sign-in links, choose Create or reset password below.",
          ),
        );
        return;
      }

      const { data: mustUseMfa, error: requirementError } = await supabase.rpc(
        "requires_mfa_for_current_user",
      );
      if (requirementError) {
        setMessage(
          t(
            "Signed in, but FarmVoice could not verify your account security requirements. Please try again.",
          ),
        );
        return;
      }

      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.error) {
        setMessage(
          t(
            "Signed in, but FarmVoice could not verify your two-factor authentication status. Please try again.",
          ),
        );
        return;
      }

      if (mustUseMfa && aal.data.currentLevel !== "aal2") {
        const currentParams = new URL(window.location.href).searchParams;
        const destination = safeNextPath(
          currentParams.get("next"),
          window.location.origin,
        );
        window.location.assign("/mfa?next=" + encodeURIComponent(destination));
        return;
      }

      const params = new URL(window.location.href).searchParams;
      const next = safeNextPath(params.get("next"), window.location.origin);

      if (!next.startsWith("/join") && !next.startsWith("/worker")) {
        const farmResponse = await fetch("/api/farm/ensure-owner", {
          method: "POST",
        });
        if (!farmResponse.ok) {
          setMessage(
            t(
              "Signed in, but FarmVoice could not finish setting up your farm account. Please try again.",
            ),
          );
          return;
        }
      }

      window.location.assign(next);
    } catch {
      setMessage(
        t("FarmVoice authentication is not configured on this deployment yet."),
      );
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="container section" lang={es ? "es" : "en"}>
      <button className="btn secondary" onClick={toggle}>
        {es ? "English" : "Español"}
      </button>
      <div className="card" style={{ maxWidth: 560, margin: "20px auto" }}>
        <div className="kicker">{t("Sign in")}</div>
        <h2>{t("Email and password")}</h2>
        <p className="muted">
          {t(
            "Sign in with your FarmVoice email and password. You do not need an email link each time.",
          )}
        </p>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">{t("Email address")}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t("Password")}</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={signingIn}>
            {signingIn ? t("Signing in...") : t("Sign in")}
          </button>
        </form>
        {message && (
          <p className="notice warn" style={{ marginTop: 14 }}>
            {message}
          </p>
        )}
        <div className="inline" style={{ marginTop: 18 }}>
          <Link className="footer-link" href="/signup">
            {t("Create account")}
          </Link>
          <span className="muted">·</span>
          <Link className="footer-link" href="/reset-password">
            {t("Create or reset password")}
          </Link>
        </div>
      </div>
    </main>
  );
}
