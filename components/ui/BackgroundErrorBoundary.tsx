"use client";

import { Component, type ReactNode } from "react";
import { reportClientEvent } from "@/lib/telemetry/report-client";

/**
 * The WebGL background is decoration. If it ever throws while rendering, show
 * the page without it (the body keeps its themed background colour) instead of
 * letting the error reach app/global-error.tsx and replace the whole page.
 */
export default class BackgroundErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    const name = error instanceof Error ? error.name : "Error";
    reportClientEvent("background", `render crash ${name}`);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
