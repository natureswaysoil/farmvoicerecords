"use client";
import { guideVideos } from "@/src/lib/videos";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  findHelpItems,
  helpItems,
  SUPPORT_EMAIL,
} from "@/src/lib/help-content";

const tourSteps = [
  [
    "1",
    "Create a farm record",
    "Open Field records. Speak or type the details, review the organized information, capture GPS when useful, then save a draft or confirmed record.",
    "/records",
  ],
  [
    "2",
    "Set up fields",
    "Open Fields to maintain production areas or import USDA/FSA field boundaries from farmers.gov files.",
    "/fields",
  ],
  [
    "3",
    "Set up your team",
    "Open Team to copy the farm join code, schedule work, use GPS clock-in/out, review time, and prepare approved hours.",
    "/team",
  ],
  [
    "4",
    "Attach Smart Photo Evidence",
    "On supported saved records, use the evidence control to take a photo, choose an existing image, or attach a supported PDF.",
    "/records",
  ],
  [
    "5",
    "Use H-2A workspaces",
    "H-2A includes contracts, workers, daily crew records, housing, transportation, training, recruitment, separations, documents, and audit support.",
    "/h2a",
  ],
  [
    "6",
    "Connect QuickBooks",
    "Farm owners can authorize QuickBooks Online, map workers to employees, and send approved completed time.",
    "/integrations/quickbooks",
  ],
] as const;

export default function HelpCenterClient() {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => (query.trim() ? findHelpItems(query, helpItems.length) : helpItems),
    [query],
  );
  const videoUrl = process.env.NEXT_PUBLIC_FARMVOICE_TOUR_VIDEO_URL?.trim();

  return (
    <main className="container section stack">
      <div>
        <div className="kicker">FarmVoice Help Center</div>
        <h1>Get answers and get back to the farm.</h1>
        <p className="lede">
          Getting started, searchable FAQs, FarmVoice workflows, and direct
          support in one place.
        </p>
      </div>

      <section id="getting-started" className="card stack">
        <div>
          <div className="kicker">Getting started</div>
          <h2>FarmVoice instructional tour</h2>
        </div>
        {videoUrl ? (
          <div className="video-frame">
            <iframe
              src={videoUrl}
              title="FarmVoice Records instructional video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="notice">
            <strong>Start with a section guide.</strong>
            <p>
              Open a FarmVoice workspace and choose “Watch guide” for a short
              narrated walkthrough. The written steps below cover the full
              getting started path.
            </p>
          </div>
        )}
        <div className="grid-2">
          {tourSteps.map(([number, title, body, href]) => (
            <article className="card stack" key={number}>
              <span className="badge">Step {number}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
              <Link className="footer-link" href={href}>
                Open this feature →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="kicker">Short video guides</div>
        <h2>Watch a feature walkthrough</h2>
        <div className="grid-3">
          {guideVideos.map(({ title, src: href }) => (
            <a className="card footer-link" href={href} key={href}>
              ▶ {title}
            </a>
          ))}
        </div>
        <p className="small muted">
          Each guide has spoken instructions and on-screen captions. Videos play
          only when you choose them.
        </p>
      </section>

      <section className="card stack">
        <div>
          <div className="kicker">FAQ</div>
          <h2>Search FarmVoice help</h2>
        </div>
        <div className="field">
          <label htmlFor="help-search">What do you need help with?</label>
          <input
            id="help-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GPS, QuickBooks, H-2A, photos, USDA fields..."
          />
        </div>
        <p className="small muted">
          {results.length} answer{results.length === 1 ? "" : "s"} shown
        </p>
        <div className="faq-list">
          {results.map((item) => (
            <details className="faq-item" key={item.id}>
              <summary>
                <span className="badge">{item.category}</span> {item.question}
              </summary>
              <p>{item.answer}</p>
              {item.href && (
                <Link className="footer-link" href={item.href}>
                  {item.linkLabel ?? "Open page"} →
                </Link>
              )}
            </details>
          ))}
          {!results.length && (
            <div className="notice">
              No FAQ matched that search. Try fewer words or contact FarmVoice
              Support.
            </div>
          )}
        </div>
      </section>

      <section className="card stack">
        <div className="kicker">Still need help?</div>
        <h2>Contact FarmVoice Support</h2>
        <p>
          Email{" "}
          <a className="footer-link" href={"mailto:" + SUPPORT_EMAIL}>
            {SUPPORT_EMAIL}
          </a>
          . Include your farm name, page, device/browser, and visible error
          message. Never send passwords, access tokens, QuickBooks secrets, or
          payment-card details.
        </p>
        <a className="btn" href={"mailto:" + SUPPORT_EMAIL}>
          Email support
        </a>
      </section>
    </main>
  );
}
