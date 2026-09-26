"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function JoinPage() {
  const [supabase] = useState(() => createClient());
  const [code, setCode] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, [supabase]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,10}$/.test(normalized)) {
      setMessage("Enter the complete 6- to 10-character farm join code.");
      return;
    }

    setJoining(true);
    setMessage("");

    try {
      const { error } = await supabase.rpc("join_farm_by_code", {
        p_join_code: normalized,
        p_employee_number: employeeNumber.trim() || null,
      });

      if (error) {
        setMessage(error.message || "Unable to join this farm.");
        return;
      }

      setMessage("Farm joined successfully. Opening your team workspace...");
      window.location.assign("/team");
    } finally {
      setJoining(false);
    }
  }

  const returnPath = "/join";

  return (
    <main className="container section">
      <div className="card" style={{ maxWidth: 620, margin: "20px auto" }}>
        <div className="kicker">Join a farm team</div>
        <h2>Worker browser setup</h2>
        <p className="muted">
          Workers can create or sign in to their FarmVoice account in the browser, then enter the complete farm join code from the farm owner.
        </p>

        {signedIn === false && (
          <div className="notice" style={{ marginBottom: 18 }}>
            <strong>Sign in first.</strong>
            <p className="small">Your join code will be entered after sign-in, so FarmVoice does not accidentally create a separate owner farm.</p>
            <div className="inline">
              <Link className="btn" href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in</Link>
              <Link className="btn secondary" href={`/signup?next=${encodeURIComponent(returnPath)}`}>Create worker account</Link>
            </div>
          </div>
        )}

        {signedIn !== false && (
          <form className="form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="code">Farm join code</label>
              <input
                id="code"
                autoCapitalize="characters"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="4CEC570164"
                maxLength={10}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="employee-number">Employee number (optional)</label>
              <input
                id="employee-number"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                placeholder="EMP-001"
                maxLength={50}
              />
            </div>
            <button className="btn" type="submit" disabled={joining || signedIn === null}>
              {joining ? "Joining farm..." : "Join farm"}
            </button>
          </form>
        )}

        {message && <p className="notice" style={{ marginTop: 14 }}>{message}</p>}
      </div>
    </main>
  );
}
