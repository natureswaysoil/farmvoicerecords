"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage("");

    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/auth/confirm`,
          shouldCreateUser: true,
        },
      });

      setMessage(error ? error.message : "Check your email for your FarmVoice sign-in link.");
    } catch {
      setMessage("FarmVoice authentication is not configured on this deployment yet.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="container section">
      <div className="card" style={{ maxWidth: 560, margin: "20px auto" }}>
        <div className="kicker">Sign in</div>
        <h2>Email sign-in</h2>
        <p className="muted">
          Enter your email and FarmVoice will send a one-time passwordless sign-in link.
        </p>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <button className="btn" type="submit" disabled={sending}>
            {sending ? "Sending..." : "Email me a sign-in link"}
          </button>
        </form>
        {message && <p className="notice" style={{ marginTop: 14 }}>{message}</p>}
      </div>
    </main>
  );
}
