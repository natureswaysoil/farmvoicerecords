"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const videos = [
  { prefix: "/h2a/housing", title: "H-2A housing", src: "/videos/farmvoice-housing.mp4" },
  { prefix: "/h2a", title: "H-2A records", src: "/videos/farmvoice-h2a.mp4" },
  { prefix: "/integrations/quickbooks", title: "QuickBooks", src: "/videos/farmvoice-quickbooks.mp4" },
  { prefix: "/records", title: "Field records", src: "/videos/farmvoice-records.mp4" },
  { prefix: "/fields", title: "Fields", src: "/videos/farmvoice-fields.mp4" },
  { prefix: "/team", title: "Team and GPS time", src: "/videos/farmvoice-team.mp4" },
];

export default function SectionVideoHelp() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const video = videos.find(({ prefix }) => pathname === prefix || pathname.startsWith(prefix + "/"));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!video) return null;

  return (
    <>
      <button className="section-video-button" type="button" onClick={() => setOpen(true)}>
        ▶ Watch {video.title} guide
      </button>
      {open && (
        <div className="section-video-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="section-video-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={video.title + " walkthrough"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-video-header">
              <div>
                <div className="kicker">FarmVoice walkthrough</div>
                <h2>{video.title}</h2>
              </div>
              <button className="text-button" type="button" onClick={() => setOpen(false)} autoFocus>
                Close
              </button>
            </div>
            <video key={video.src} controls playsInline preload="metadata" className="section-video-player">
              <source src={video.src} type="video/mp4" />
              Your browser does not support this video. Open the MP4 directly from the Help Center.
            </video>
            <p className="small muted">
              This illustrated guide has spoken instructions and on-screen captions.
              Review your own records and requirements before saving or submitting information.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
