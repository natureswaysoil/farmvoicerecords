"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const error = new URL(window.location.href).searchParams.get("error");
    if (error === "farm_setup_failed") {
      setMessage("Your email was confirmed, but FarmVoice could not finish setting up the farm account. Sign in again to retry.");
    } else if (error === "confirmation_invalid") {
      setMessage("That confirmation link is invalid or expired. Request a new confirmation or password setup link.");
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setMessage("Email or password is incorrect. If you previously used email sign-in links, choose Create or reset password below.");
        return;
      }

      const farmResponse = await fetch("/api/farm/ensure-owner", { method: "POST" });
      if (!farmResponse.ok) {
        setMessage("Signed in, but FarmVoice could not finish setting up your farm account. Please try again.");
        return;
      }

      window.location.assign("/records");
    } catch {
      setMessage("FarmVoice authentication is not configured on this deployment yet.");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="container section">
      <div className="card" style={{ maxWidth: 560, margin: "20px auto" }}>
        <div className="kicker">Sign in</div>
        <h2>Email and password</h2>
        <p className="muted">
          Sign in with your FarmVoice email and password. You do not need an email link each time.
        </p>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email address</label>
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
            <label htmlFor="password">Password</label>
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
            {signingIn ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {message && <p className="notice warn" style={{ marginTop: 14 }}>{message}</p>}
        <div className="inline" style={{ marginTop: 18 }}>
          <Link className="footer-link" href="/signup">Create account</Link>
          <span className="muted">·</span>
          <Link className="footer-link" href="/reset-password">Create or reset password</Link>
        </div>
      </div>
    </main>
  );
}
