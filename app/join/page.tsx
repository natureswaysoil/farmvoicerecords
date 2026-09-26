"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export default function JoinPage() {
  const [supabase] = useState(() => createClient());
  const [code, setCode] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "worker" | null>(null);
  const [message, setMessage] = useState("");
  const [joining, setJoining] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      setSignedIn(Boolean(user));
      setEmail(user?.email ?? null);

      if (!user) {
        setRole(null);
        return;
      }

      const { data: member } = await supabase
        .from("farm_members")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      setRole((member?.role as "owner" | "worker" | undefined) ?? null);
    })();
  }, [supabase]);

  async function useDifferentAccount() {
    setSwitching(true);
    setMessage("");
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      setMessage("Unable to sign out this browser session. Please try again.");
      setSwitching(false);
      return;
    }
    window.location.assign("/login?next=%2Fjoin");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,10}$/.test(normalized)) {
      setMessage("Enter the complete 6- to 10-character farm join code.");
      return;
    }

    if (role === "owner") {
      setMessage("You are signed in as a farm owner. Use a different worker account before joining.");
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
            <p className="small">Use the worker's FarmVoice account, not the farm owner's account.</p>
            <div className="inline">
              <Link className="btn" href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in</Link>
              <Link className="btn secondary" href={`/signup?next=${encodeURIComponent(returnPath)}`}>Create worker account</Link>
            </div>
          </div>
        )}

        {signedIn && (
          <div className="notice" style={{ marginBottom: 18 }}>
            <strong>Signed in as {email ?? "this account"}</strong>
            {role === "owner" ? (
              <>
                <p className="small">
                  This is a farm-owner account, so it cannot be added again as a worker. Sign out of this browser session and use the worker account.
                </p>
                <button className="btn secondary" type="button" onClick={useDifferentAccount} disabled={switching}>
                  {switching ? "Signing out..." : "Use a different account"}
                </button>
              </>
            ) : (
              <p className="small">If this is not the worker account you want to add, use a different account before joining.</p>
            )}
          </div>
        )}

        {signedIn && role !== "owner" && (
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
