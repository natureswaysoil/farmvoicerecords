"use client";

import { useEffect, useRef, useState } from "react";
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
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const video = videos.find(({ prefix }) => pathname === prefix || pathname.startsWith(prefix + "/"));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    closeRef.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [open]);

  if (!video) return null;

  return (
    <>
      <button ref={openerRef} className="section-video-button" type="button" onClick={() => setOpen(true)}>
        ▶ Watch {video.title} guide
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          className="section-video-dialog"
          aria-label={video.title + " walkthrough"}
          onCancel={() => setOpen(false)}
          onClick={(event) => {
            // Backdrop clicks are retargeted to the dialog element.
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
                event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
          }}
        >
          <div className="section-video-header">
            <div>
              <div className="kicker">FarmVoice walkthrough</div>
              <h2>{video.title}</h2>
            </div>
            <button ref={closeRef} className="text-button" type="button" onClick={() => setOpen(false)}>
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
        </dialog>
      )}
    </>
  );
}
