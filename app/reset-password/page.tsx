"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [readyToUpdate, setReadyToUpdate] = useState(false);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;

    async function initializeRecovery() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.pathname + url.search);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (active && data.session) setReadyToUpdate(true);
    }

    initializeRecovery();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (active && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
        setReadyToUpdate(true);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setMessage("");

    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    setMessage(
      error
        ? error.message
        : "Check your email for the password setup link. Open the newest email, then choose your password here."
    );
    setWorking(false);
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (newPassword.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setWorking(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setMessage(error.message);
      setWorking(false);
      return;
    }

    setMessage("Password saved. You can now sign in without requesting an email link.");
    setWorking(false);
    setTimeout(() => window.location.assign("/login"), 1200);
  }

  return (
    <main className="container section">
      <div className="card" style={{ maxWidth: 560, margin: "20px auto" }}>
        <div className="kicker">Password help</div>
        <h2>{readyToUpdate ? "Choose a new password" : "Create or reset password"}</h2>

        {readyToUpdate ? (
          <form className="form" onSubmit={updatePassword}>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" minLength={8} required
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button className="btn" type="submit" disabled={working}>
              {working ? "Saving..." : "Save password"}
            </button>
          </form>
        ) : (
          <>
            <p className="muted">
              Enter your FarmVoice email. We will send one password setup link. After you set the password, normal sign-ins use email and password.
            </p>
            <form className="form" onSubmit={requestReset}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input id="email" type="email" autoComplete="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className="btn" type="submit" disabled={working}>
                {working ? "Sending..." : "Send password setup link"}
              </button>
            </form>
          </>
        )}

        {message && <p className="notice" style={{ marginTop: 14 }}>{message}</p>}
        <p className="muted" style={{ marginTop: 18 }}>
          <Link className="footer-link" href="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
