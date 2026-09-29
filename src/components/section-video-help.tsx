"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { guideVideos as videos } from "@/src/lib/videos";

export default function SectionVideoHelp() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const video = videos.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );

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
      <button
        ref={openerRef}
        className="section-video-button"
        type="button"
        onClick={() => setOpen(true)}
      >
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
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              setOpen(false);
          }}
        >
          <span
            tabIndex={0}
            aria-hidden="true"
            className="focus-guard"
            onFocus={() => playerRef.current?.focus()}
          />
          <div className="section-video-header">
            <div>
              <div className="kicker">FarmVoice walkthrough</div>
              <h2>{video.title}</h2>
            </div>
            <button
              ref={closeRef}
              className="text-button"
              type="button"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <video
            ref={playerRef}
            tabIndex={0}
            key={video.src}
            controls
            playsInline
            preload="metadata"
            className="section-video-player"
          >
            <source src={video.src} type="video/mp4" />
            Your browser does not support this video. Open the MP4 directly from
            the Help Center.
          </video>
          <p className="small muted">
            This illustrated guide has spoken instructions and on-screen
            captions. Review your own records and requirements before saving or
            submitting information.
          </p>
          <span
            tabIndex={0}
            aria-hidden="true"
            className="focus-guard"
            onFocus={() => closeRef.current?.focus()}
          />
        </dialog>
      )}
    </>
  );
}
