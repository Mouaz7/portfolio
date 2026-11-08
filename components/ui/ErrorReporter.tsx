"use client";

import { useEffect } from "react";
import { reportClientEvent } from "@/lib/telemetry/report-client";

function fromThisSite(filename: string | undefined) {
  if (!filename) return false;
  try {
    return new URL(filename, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Only rejections whose stack runs through this site's own bundles. */
function ownRejection(reason: unknown): reason is Error {
  return reason instanceof Error
    && typeof reason.stack === "string"
    && reason.stack.includes(`${window.location.origin}/_next/`);
}

/**
 * Sends anonymous reports for uncaught errors in the site's own scripts, so
 * problems on devices nobody here can test on become visible. Errors from
 * browser extensions and other sites' scripts are ignored. Renders nothing.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!fromThisSite(event.filename)) return;
      // Firefox reports loads cancelled by navigation as errors.
      if (/NS_BINDING_ABORTED/.test(event.message)) return;
      const name = event.error instanceof Error ? event.error.name : "Error";
      reportClientEvent("error", `${name}: ${event.message}`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as unknown;
      // Extensions and third-party scripts reject promises in the page too;
      // cancelled requests and navigations are not failures.
      if (!ownRejection(reason) || reason.name === "AbortError") return;
      reportClientEvent("unhandled-rejection", `${reason.name}: ${reason.message}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
