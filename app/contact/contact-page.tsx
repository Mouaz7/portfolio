"use client";
import "./contact-repository.css";
import "./contact-repository-adaptive.css";

import type { NextPage } from "next";
import { useCallback, useRef } from "react";

import Header from "@/components/navigation/Header";
import Footer from "@/components/navigation/Footer";
import PhotoSocialContainer from "@/components/contact/photo-social-container";
import EmailForm, {
  type ContactFailureReason,
  type ContactSendResult,
} from "@/components/contact/email-form";
import ContactRepositoryHeader from "@/components/contact/ContactRepositoryHeader";
import { fetchWithTurnstile } from "@/lib/security/turnstile-client";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { ContactSocialLink } from "@/lib/contact/social-links";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFieldFocusWithin } from "@/hooks/useFieldFocusWithin";
import {
  computeFluidStageWidth,
  useViewportFitStage,
} from "@/hooks/useViewportFitStage";
import { useRouteEntrance } from "@/components/navigation/NavigationExperienceProvider";

const MOBILE_FORM_CLASS = "w-full p-0";
const CONTACT_STAGE_MIN_WIDTH = 560;
const CONTACT_STAGE_FALLBACK_WIDTH = 1328;
const CONTACT_STAGE_MAX_WIDTH = 1875;
const CONTACT_STAGE_HEIGHT = 720;

type ContactApiBody = {
  ok?: boolean;
  code?: unknown;
};

/**
 * Maps a failed /api/contact/* response to a reason the form can explain.
 * Codes come from lib/security/request-protection.ts (security layer) and the
 * prepare/send routes.
 */
function failureFromResponse(status: number, body: ContactApiBody): ContactFailureReason {
  switch (body.code) {
    case "rate_limited":
      return "rate_limited";
    // Still required after the Turnstile retry: the check could not finish.
    case "captcha_required":
      return "captcha_failed";
    case "captcha_invalid":
      return "captcha_invalid";
    case "busy":
    case "security_unavailable":
      return "busy";
    case "attachments_unavailable":
    case "attachment_scan_failed":
      return "attachments_unavailable";
    case "attachment_infected":
    case "attachment_invalid":
      return "attachment_rejected";
    // The submission expired, or the session cookie never came back.
    case "submission_not_found":
      return cookiesBlocked() ? "cookies_blocked" : "failed";
    default:
      if (status === 429) return "rate_limited";
      if (status === 503) return "busy";
      return "failed";
  }
}

function cookiesBlocked() {
  return typeof navigator !== "undefined" && navigator.cookieEnabled === false;
}

// Long enough for a slow phone network and the server's mail and scan work
// (the send route itself stops after about 40 s).
const PREPARE_TIMEOUT_MS = 30_000;
const SEND_TIMEOUT_MS = 90_000;

/** Runs a request that is aborted, as a "timeout", when it takes too long. */
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function failureFromError(error: unknown): ContactFailureReason {
  // An aborted fetch rejects with an AbortError (a DOMException).
  if ((error as { name?: unknown } | null)?.name === "AbortError") return "timeout";
  // lib/security/turnstile-client.ts rejects with "Turnstile …" errors.
  if (error instanceof Error && /turnstile/i.test(error.message)) return "captcha_failed";
  // fetch() rejects with a TypeError when the network request itself fails.
  if (error instanceof TypeError) return "network";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  return "failed";
}

const failed = (reason: ContactFailureReason): ContactSendResult => ({ ok: false, reason });

type ContactPageProps = {
  attachmentsEnabled?: boolean;
  initialLinks?: ContactSocialLink[];
};

const ContactPage: NextPage<ContactPageProps> = ({
  attachmentsEnabled = false,
  initialLinks,
}) => {
  const { dictionary } = useI18n();
  const routeEntrance = useRouteEntrance();
  const mainRef = useRef<HTMLElement>(null);
  const adaptiveLayout = useMediaQuery("(min-width: 676px)");
  // The keyboard shrinks the page while typing; without this the scaled form
  // would shrink with it (to unreadable sizes on landscape phones/tablets).
  const typing = useFieldFocusWithin(mainRef);
  const {
    scale,
    fitScale,
    profile,
    availableWidth,
    stageStyle,
  } = useViewportFitStage({
    baseWidth: CONTACT_STAGE_MIN_WIDTH,
    baseHeight: CONTACT_STAGE_HEIGHT,
    containerRef: mainRef,
    maxScale: 1.6,
    padX: 0,
    padY: 0,
    transformOrigin: "50% 50%",
    freeze: typing,
  });
  const fluidStageWidth = Math.min(
    CONTACT_STAGE_MAX_WIDTH,
    Math.max(
      CONTACT_STAGE_MIN_WIDTH,
      computeFluidStageWidth(
        availableWidth,
        scale,
        CONTACT_STAGE_FALLBACK_WIDTH,
      ),
    ),
  );
  const handleSend = useCallback(
    async ({ name, email, message, files }: {
      name: string;
      email: string;
      message: string;
      files: File[];
    }): Promise<ContactSendResult> => {
      try {
        if (files.length > 0 && !attachmentsEnabled) return failed("attachments_unavailable");
        // The send step needs the session cookie set by the prepare step.
        if (cookiesBlocked()) return failed("cookies_blocked");
        const prepareResponse = await withTimeout(PREPARE_TIMEOUT_MS, (signal) => fetchWithTurnstile("/api/contact/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            message,
            files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
          }),
          signal,
        }, "contact"));
        const prepared = await prepareResponse.json().catch(() => ({})) as ContactApiBody & {
          submissionId?: string;
          uploads?: Array<{ path: string; token: string }>;
        };
        if (!prepareResponse.ok || !prepared.ok || !prepared.submissionId) {
          return failed(failureFromResponse(prepareResponse.status, prepared));
        }

        if (files.length > 0) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !supabaseKey || prepared.uploads?.length !== files.length) {
            return failed("attachments_unavailable");
          }
          const { createClient } = await import("@supabase/supabase-js");
          const storage = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false },
          }).storage.from("contact-uploads");
          for (let index = 0; index < files.length; index += 1) {
            const upload = prepared.uploads[index];
            const { error } = await storage.uploadToSignedUrl(upload.path, upload.token, files[index], {
              contentType: files[index].type,
              upsert: false,
            });
            if (error) return failed("failed");
          }
        }

        const submissionId = prepared.submissionId;
        const sendResponse = await withTimeout(SEND_TIMEOUT_MS, (signal) => fetch("/api/contact/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId }),
          signal,
        }));
        const sent = await sendResponse.json().catch(() => ({})) as ContactApiBody;
        if (sendResponse.ok && sent.ok) return { ok: true };
        return failed(failureFromResponse(sendResponse.status, sent));
      } catch (error) {
        return failed(failureFromError(error));
      }
    },
    [attachmentsEnabled],
  );

  return (
    <div
      className="contact-page relative flex h-dvh min-h-0 w-full flex-col overflow-hidden"
      data-viewport-page="contact"
      data-route-entrance={routeEntrance}
      data-viewport-profile={adaptiveLayout ? profile : "accessible-overflow"}
    >
      <Header />

      <main
        id="main-content"
        tabIndex={-1}
        ref={mainRef}
        className="contact-main relative z-10 min-h-0 flex-1 px-2 min-[676px]:px-6"
      >
        <h1 className="sr-only">{dictionary.contact.title}</h1>
        <div
          className="contact-stage-viewport"
          data-viewport-stage
          data-viewport-scale={adaptiveLayout ? fitScale.toFixed(3) : "1.000"}
        >
          <div
            className="contact-stage-surface"
            style={
              adaptiveLayout
                ? {
                  ...stageStyle,
                  width: fluidStageWidth,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                }
                : undefined
            }
          >
            <section
              className="contact-repository-shell"
              aria-label={dictionary.contact.repository}
              style={
                adaptiveLayout
                  ? { width: "100%", height: "100%", minHeight: 0, transform: "none" }
                  : undefined
              }
            >
              <ContactRepositoryHeader />

              <div className="contact-repository-workspace">
                <div className="contact-phone-layout min-[676px]:hidden">
                  <EmailForm
                    attachmentsEnabled={attachmentsEnabled}
                    idPrefix="contact-mobile"
                    onSend={handleSend}
                    showMobileIcons
                    initialLinks={initialLinks}
                    className={MOBILE_FORM_CLASS}
                  />
                </div>

                <div className="contact-adaptive-layout hidden min-[676px]:flex h-full w-full items-center justify-center">
                  <div className="contact-premium-shell grid w-full min-w-0 overflow-visible">
                    <div
                      className="contact-profile-column contact-enter-left min-w-0 overflow-visible"
                    >
                      <PhotoSocialContainer
                        className="contact-profile-card h-full w-full max-w-none"
                        initialLinks={initialLinks}
                      />
                    </div>

                    <div
                      className="contact-form-column contact-enter-right grid min-w-0 place-items-center overflow-visible"
                    >
                      <EmailForm
                        attachmentsEnabled={attachmentsEnabled}
                        idPrefix="contact-desktop"
                        onSend={handleSend}
                        className="contact-email-form w-full max-w-[820px]"
                        initialLinks={initialLinks}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer className="shrink-0" />
    </div>
  );
};

export default ContactPage;
