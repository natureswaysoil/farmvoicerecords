"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { findHelpItems, SUPPORT_EMAIL, type HelpItem } from "@/src/lib/help-content";

const PUBLIC_PATHS = new Set(["/","/login","/signup","/reset-password","/privacy","/terms","/billing","/support","/help"]);
const SETUP_PATH_PREFIXES = ["/mfa", "/auth", "/confirm", "/update-password"];

function isSetupPath(pathname: string) {
  return SETUP_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export default function FarmVoiceHelpShell() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<HelpItem | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id && !PUBLIC_PATHS.has(pathname) && !isSetupPath(pathname)) {
        const key = "farmvoice:onboarding:v1:" + id;
        if (window.localStorage.getItem(key) !== "complete") setShowOnboarding(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [pathname, supabase]);

  function completeOnboarding(destination?: string) {
    if (userId) window.localStorage.setItem("farmvoice:onboarding:v1:" + userId, "complete");
    setShowOnboarding(false);
    if (destination) window.location.assign(destination);
  }

  function ask(event: FormEvent) {
    event.preventDefault();
    const matches = findHelpItems(question, 1, 5);
    if (matches.length) {
      setAnswer(matches[0]);
      setNoMatch(false);
    } else {
      setAnswer(null);
      setNoMatch(true);
    }
  }

  if (!userId || isSetupPath(pathname)) return null;

  return (
    <>
      {showOnboarding && (
        <div className="onboarding-backdrop" role="presentation">
          <section className="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="farmvoice-welcome-title">
            <div className="kicker">Welcome to FarmVoice Records</div>
            <h2 id="farmvoice-welcome-title">Get comfortable with FarmVoice in a few minutes.</h2>
            <p className="muted">
              See how to create records, manage your crew, use GPS time, attach Smart Photo Evidence,
              work with H-2A records, and connect QuickBooks.
            </p>
            <div className="onboarding-steps" aria-label="Tour topics">
              <span>🎙 Records</span><span>📍 GPS time</span><span>📷 Photo evidence</span>
              <span>👥 H-2A</span><span>📘 QuickBooks</span>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => completeOnboarding("/help#getting-started")}>▶ Watch instructional tour</button>
              <button className="btn secondary" onClick={() => completeOnboarding()}>Start using FarmVoice</button>
            </div>
            <button className="text-button" onClick={() => setShowOnboarding(false)}>Remind me next time</button>
          </section>
        </div>
      )}

      <button className="help-fab" onClick={() => setChatOpen((open) => !open)} aria-expanded={chatOpen} aria-controls="farmvoice-help-chat">
        {chatOpen ? "Close" : "💬 Ask FarmVoice"}
      </button>

      {chatOpen && (
        <section id="farmvoice-help-chat" className="help-chat" aria-label="FarmVoice help assistant">
          <div className="help-chat-head">
            <div><strong>Ask FarmVoice</strong><div className="small muted">Instant help from the FarmVoice guide</div></div>
            <button className="text-button" onClick={() => setChatOpen(false)} aria-label="Close help">✕</button>
          </div>
          <p className="small">Ask how to use a FarmVoice feature. This assistant provides product guidance, not legal or regulatory advice.</p>
          <form className="form" onSubmit={ask}>
            <div className="field">
              <label htmlFor="farmvoice-question">Your question</label>
              <textarea id="farmvoice-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How do I connect QuickBooks?" />
            </div>
            <button className="btn" type="submit" disabled={!question.trim()}>Ask</button>
          </form>
          {answer && (
            <div className="notice help-answer">
              <strong>{answer.question}</strong>
              <p>{answer.answer}</p>
              {answer.href && <Link className="footer-link" href={answer.href}>{answer.linkLabel ?? "Open page"} →</Link>}
            </div>
          )}
          {noMatch && (
            <div className="notice">
              <strong>I could not find a confident answer.</strong>
              <p>Try different words, search the full Help Center, or email FarmVoice Support.</p>
            </div>
          )}
          <div className="help-chat-links">
            <Link className="footer-link" href="/help">Search Help & FAQ</Link>
            <a className="footer-link" href={"mailto:" + SUPPORT_EMAIL}>Email {SUPPORT_EMAIL}</a>
          </div>
        </section>
      )}
    </>
  );
}
