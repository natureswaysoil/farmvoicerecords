"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
export default function AuthNavigation() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const client = createClient();
    void client.auth
      .getSession()
      .then(({ data }) => setSignedIn(Boolean(data.session)));
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => subscription.unsubscribe();
  }, []);
  return (
    <nav className="nav-links" aria-label="Main navigation">
      {signedIn ? (
        <>
          <Link href="/records">Records</Link>
          <Link href="/ask-farmvoice">Ask FarmVoice</Link>
          <Link href="/fields">Fields</Link>
          <Link href="/map">Map</Link>
          <Link href="/team">Team</Link>
          <Link href="/team/crew">Crew / Cuadrilla</Link>
          <Link href="/worker">Worker clock / Reloj</Link>
          <Link href="/h2a">H-2A</Link>
          <Link href="/h2a/housing">Housing</Link>
          <Link href="/integrations/quickbooks">QuickBooks</Link>
          <Link href="/integrations/equipment">Equipment data</Link>
          <Link href="/join">Join farm</Link>
        </>
      ) : (
        <Link href="/demo">See a demo</Link>
      )}
      <Link href="/billing">Pricing</Link>
      <Link href="/help">Help & FAQ</Link>
      <Link href="/security">Security</Link>
      {signedIn ? (
        <button
          className="text-button"
          onClick={async () => {
            await createClient().auth.signOut();
            window.location.assign("/");
          }}
        >
          Sign out
        </button>
      ) : (
        <>
          <Link href="/login">Sign in</Link>
          <Link className="btn" href="/signup">
            Start free trial
          </Link>
        </>
      )}
    </nav>
  );
}
