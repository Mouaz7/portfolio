"use client";
import React, { useEffect, useRef, useState } from "react";
import { openUrl } from "@/lib/navigation/open-url";
import { reportClientEvent } from "@/lib/telemetry/report-client";

type DownloadState = "idle" | "downloading" | "downloaded" | "error";

// In-app browsers (Instagram, Facebook, LinkedIn, TikTok, Line, Snapchat,
// Android WebViews) ignore downloads of blob: links, so the button would say
// "downloaded" while nothing happened.
const IN_APP_BROWSER = /\b(FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|TikTok|musical_ly|Snapchat|Twitter|; wv\))/i;

export function isInAppBrowser(userAgent: string) {
  return IN_APP_BROWSER.test(userAgent);
}

type DownloadCvButtonProps =
  React.ComponentProps<"button"> & {
    className?: string;
    downloadCV?: string;
    downloadingLabel?: string;
    downloadedLabel?: string;
    errorLabel?: string;
    href?: string;
  };

export default function DownloadCvButton({
  className = "",
  downloadCV = "Download CV",
  downloadingLabel = "Downloading...",
  downloadedLabel = "Downloaded ✓",
  errorLabel = "Download failed — retry",
  href,
  ...btnProps
}: DownloadCvButtonProps) {
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const resetLater = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setDownloadState("idle"), 3000);
  };

  // Handle CV download
  const handleDownload = async () => {
    if (!href || downloadState === "downloading") return;

    setDownloadState("downloading");

    try {
      if (isInAppBrowser(navigator.userAgent)) {
        // Check first that the CV is available: navigating to a failing
        // /api/cv would replace the page with a raw error.
        const check = await fetch(href, { method: "HEAD", cache: "no-cache" });
        if (!check.ok) throw new Error(`CV request failed with ${check.status}`);
        // The server sends the PDF as an attachment, so a plain navigation
        // downloads (or opens) it and the page stays where it is.
        openUrl(href);
        setDownloadState("downloaded");
        resetLater();
        return;
      }

      // Revalidate with the server (ETag/Last-Modified) instead of bypassing the
      // HTTP cache, so an unchanged CV is answered with a body-less 304.
      const response = await fetch(href, { cache: "no-cache" });
      if (!response.ok) throw new Error(`CV request failed with ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.includes("pdf") || blob.size === 0) throw new Error("CV response is not a PDF");
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.download = "CV.pdf";
      link.style.display = "none";
      link.href = objectUrlRef.current;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloadState("downloaded");
      resetLater();
    } catch (error) {
      reportClientEvent("error", `cv download ${error instanceof Error ? error.message : "failed"}`);
      // Stays until the next click, so the visitor (and a screen reader) can read it.
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setDownloadState("error");
    }
  };

  const getButtonText = () => {
    switch (downloadState) {
      case "downloading":
        return downloadingLabel;
      case "downloaded":
        return downloadedLabel;
      case "error":
        return errorLabel;
      default:
        return downloadCV;
    }
  };

  const inner = (
    <div
      className={[
        "inner relative isolate",
        "rounded-[clamp(30px,8vw,60px)]",
        downloadState === "downloaded"
          ? "bg-[color-mix(in_srgb,var(--accent)_74%,#16a34a)]"
          : downloadState === "error"
            ? "bg-[color-mix(in_srgb,var(--accent)_38%,#dc2626)]"
            : "bg-[var(--accent)]",
        "text-[var(--home-on-accent,var(--bg))]",
        "border-[rgba(var(--fg-rgb),0.22)] border-solid border-[0.5px]",
        "overflow-hidden",
        "flex flex-row items-center justify-center",
        "py-[clamp(6px,1.4vw,9px)]",
        "px-[clamp(12px,2.2vw,19px)]",
        "gap-[clamp(6px,1.4vw,11px)]",
        "transition-colors duration-300",
      ].join(" ")}
    >
      <div
        className={[
          "relative z-10",
          "text-[clamp(14px,2.2vw,25.7px)]",
          "leading-none",
          "tracking-[-0.01em] font-medium font-urbanist text-[var(--home-on-accent,var(--bg))] text-left",
          "select-none",
        ].join(" ")}
      >
        {getButtonText()}
      </div>

      <span
        className={[
          "icon relative z-10 grid place-items-center",
          "w-[clamp(22px,4vw,42px)] h-[clamp(22px,4vw,42px)]",
          "transition-transform duration-500 ease-out will-change-transform",
          downloadState === "downloading" ? "animate-spin motion-reduce:animate-none" : "",
        ].join(" ")}
      >
        {downloadState === "downloading" ? (
          // Spinner icon
          <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : downloadState === "downloaded" ? (
          // Checkmark icon
          <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 6L9 17L4 12"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : downloadState === "error" ? (
          // Error icon
          <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 8v4m0 4h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          // Default arrow icon, theme-colored by currentColor.
          <svg
            className="w-full h-full"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M5 19 19 5M8 5h11v11"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </div>
  );

  // === Outer shell (entrance controlled by `entered`) ===
  const baseClasses = [
    "group",
    downloadState === "downloading" ? "cursor-wait" : "cursor-pointer",
    "border-[var(--glass-border)] border-solid border-[2px]",
    "py-[clamp(6px,1.1vw,8px)]",
    "px-[clamp(6px,1.1vw,8px)]",
    "bg-[rgba(var(--bg-rgb),0.18)] min-h-[clamp(44px,8vw,82px)]",
    "[backdrop-filter:blur(15px)]",
    "rounded-[clamp(26px,6vw,50px)]",
    "box-border overflow-hidden",
    "flex flex-row items-center justify-center",
    "opacity-100 translate-y-0",
    "transform-gpu will-change-transform",
    "hover:shadow-[0_10px_28px_rgba(var(--accent-rgb),0.25)]",
    "active:translate-y-0 active:scale-[0.99]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.72)]",
    downloadState !== "downloading" ? "pointer-events-auto" : "pointer-events-none",
  ].join(" ");

  return (
    <>
    {/* A changing aria-label is not announced; this region is. It comes
        first so the button stays the last item in its row. */}
    <span role="status" className="sr-only">
      {downloadState === "error" ? errorLabel : downloadState === "downloaded" ? downloadedLabel : ""}
    </span>
    <button
      aria-label={getButtonText()}
      data-download-href={href}
      onClick={handleDownload}
      disabled={downloadState === "downloading"}
      className={`${baseClasses} ${className}`}
      {...btnProps}
    >
      {inner}
    </button>
    </>
  );
}
