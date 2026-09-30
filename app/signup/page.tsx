"use client";
import { useAuthLanguage } from "@/src/lib/auth-copy";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function SignupPage() {
  const { es, t, toggle } = useAuthLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage(t("Use a password with at least 8 characters."));
      return;
    }
    if (password !== confirmPassword) {
      setMessage(t("The passwords do not match."));
      return;
    }

    setCreating(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const params = new URL(window.location.href).searchParams;
      const requestedNext = params.get("next");
      const next =
        requestedNext &&
        requestedNext.startsWith("/") &&
        !requestedNext.startsWith("//")
          ? requestedNext
          : "/records";
      const confirmUrl = new URL("/auth/confirm", origin);
      confirmUrl.searchParams.set("next", next);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: confirmUrl.toString(),
        },
      });

      if (error) {
        setMessage(
          t(
            error.status === 429
              ? "Please wait a few minutes before trying again."
              : error.code === "weak_password"
                ? "Use a stronger password and try again."
                : "We could not create the account. Check your email format and connection, then retry or contact support.",
          ),
        );
        return;
      }
      if (!error && data.user?.identities?.length)
        track("signup_completed", { confirmation_required: !data.session });
      if (!error && data.session) {
        if (!next.startsWith("/join") && !next.startsWith("/worker")) {
          const farmResponse = await fetch("/api/farm/ensure-owner", {
            method: "POST",
          });
          if (!farmResponse.ok) {
            setMessage(
              t(
                "Account created, but FarmVoice could not finish setting up your farm account. Sign in and try again.",
              ),
            );
            return;
          }
        }
        window.location.assign(next);
        return;
      }

      setMessage(
        t(
          "If this email can be used for a FarmVoice account, check your inbox for the confirmation email. If you already have an account, use Create or reset password.",
        ),
      );
    } catch {
      setMessage(
        t("FarmVoice authentication is not configured on this deployment yet."),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="container section" lang={es ? "es" : "en"}>
      <button className="btn secondary" onClick={toggle}>
        {es ? "English" : "Español"}
      </button>
      <div className="card" style={{ maxWidth: 560, margin: "20px auto" }}>
        <div className="kicker">{t("Create account")}</div>
        <h2>{t("Set your FarmVoice password")}</h2>
        <p className="muted">
          {t(
            "New farm owners confirm the email address once. FarmVoice then creates the farm account automatically.",
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
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t("Password")}</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">{t("Confirm password")}</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={creating}>
            {creating ? t("Creating account...") : t("Create account")}
          </button>
        </form>
        {message && (
          <p className="notice" style={{ marginTop: 14 }}>
            {message}
          </p>
        )}
        <p className="muted" style={{ marginTop: 18 }}>
          {t("Already have an account?")}{" "}
          <Link className="footer-link" href="/login">
            {t("Sign in")}
          </Link>
          . {t("Previously used email links?")}{" "}
          <Link className="footer-link" href="/reset-password">
            {t("Create or reset password")}
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
