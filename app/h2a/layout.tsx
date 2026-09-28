"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";

export default function H2aMfaGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  const [message, setMessage] = useState("Checking account security...");

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (!active) return;
      if (userError || !userData.user) {
        const next = pathname || "/h2a";
        window.location.replace("/login?next=" + encodeURIComponent(next));
        return;
      }

      const { data: required, error: requirementError } = await supabase.rpc("requires_mfa_for_current_user");
      if (!active) return;
      if (requirementError) {
        setMessage("FarmVoice could not verify your account security requirements. Please sign in again.");
        return;
      }

      if (required) {
        const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!active) return;
        if (aalError) {
          setMessage("FarmVoice could not verify your two-factor authentication status. Please sign in again.");
          return;
        }
        if (aal.currentLevel !== "aal2") {
          const next = pathname || "/h2a";
          window.location.replace("/mfa?next=" + encodeURIComponent(next));
          return;
        }
      }

      setAllowed(true);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [pathname]);

  if (!allowed) {
    return (
      <main className="container section">
        <div className="card" style={{ maxWidth: 620, margin: "20px auto" }}>
          <div className="kicker">Account security</div>
          <h2>H-2A access</h2>
          <p className="muted">{message}</p>
        </div>
      </main>
    );
  }

  return children;
}
