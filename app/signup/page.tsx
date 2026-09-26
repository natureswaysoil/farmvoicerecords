"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setCreating(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const params = new URL(window.location.href).searchParams;
      const requestedNext = params.get("next");
      const next =
        requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
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

      if (!error && data.session) {
        if (!next.startsWith("/join")) {
          const farmResponse = await fetch("/api/farm/ensure-owner", { method: "POST" });
          if (!farmResponse.ok) {
            setMessage("Account created, but FarmVoice could not finish setting up your farm account. Sign in and try again.");
            return;
          }
        }
        window.location.assign(next);
        return;
      }

      setMessage(
        "If this email can be used for a FarmVoice account, check your inbox for the confirmation email. If you already have an account, use Create or reset password."
      );
    } catch {
      setMessage("FarmVoice authentication is not configured on this deployment yet.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="container section">
      <div className="card" style={{ maxWidth: 560, margin: "20px auto" }}>
        <div className="kicker">Create account</div>
        <h2>Set your FarmVoice password</h2>
        <p className="muted">
          New farm owners confirm the email address once. FarmVoice then creates the farm account automatically.
        </p>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" minLength={8} required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={creating}>
            {creating ? "Creating account..." : "Create account"}
          </button>
        </form>
        {message && <p className="notice" style={{ marginTop: 14 }}>{message}</p>}
        <p className="muted" style={{ marginTop: 18 }}>
          Already have an account? <Link className="footer-link" href="/login">Sign in</Link>.
          If you previously used FarmVoice email links, use <Link className="footer-link" href="/reset-password">Create or reset password</Link>.
        </p>
      </div>
    </main>
  );
}
