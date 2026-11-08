"use client";
import type { NextPage } from "next";
import React, { useEffect, useRef, useState } from "react";
import NameContainer from "@/components/contact/name-container";
import SendButton from "@/components/contact/SendButton";
import { isValidEmail, NAME_MAX, EMAIL_MAX, MESSAGE_MAX } from "@/lib/contact/validate";
import SocialIcon from "./SocialIcon";
import { useContactLinks } from "./use-contact-links";
import { useContactFiles } from "./use-contact-files";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  contactEmailFromLinks,
  FALLBACK_CONTACT_LINKS,
  type ContactSocialLink,
} from "@/lib/contact/social-links";
import {
  CONTACT_MAX_FILES,
  CONTACT_MAX_TOTAL_BYTES,
  validContactFileMetadata,
} from "@/lib/contact/file-policy";

// The same limit the server enforces (lib/contact/file-policy.ts), in MB.
const maxTotalMb = CONTACT_MAX_TOTAL_BYTES / (1024 * 1024);

type SendPayload = {
  name: string;
  email: string;
  message: string;
  files: File[];
};

export type ContactFailureReason =
  | "rate_limited"
  | "captcha_failed"
  | "captcha_invalid"
  | "busy"
  | "attachments_unavailable"
  | "attachment_rejected"
  | "cookies_blocked"
  | "network"
  | "timeout"
  | "failed";

export type ContactSendResult =
  | { ok: true }
  | { ok: false; reason: ContactFailureReason };

type Props = {
  attachmentsEnabled?: boolean;
  className?: string;
  idPrefix?: string;
  onSend?: (payload: SendPayload) =>
    | Promise<boolean | ContactSendResult>
    | boolean
    | ContactSendResult;
  showMobileIcons?: boolean;
  initialLinks?: ContactSocialLink[];
};

const FORM_WIDTH_CLASS =
  "w-full max-w-[520px] sm:max-w-[680px] min-[900px]:max-w-[760px] min-[1200px]:max-w-[820px]";

const FIELD_INPUT_CLASS =
  "max-[430px]:px-3 max-[430px]:text-base min-[900px]:h-12 min-[900px]:rounded-2xl min-[900px]:text-[19px]";

const MESSAGE_BOX_CLASS = [
  "contact-message-field relative border-[2px] rounded-2xl",
  "w-full min-w-0 box-border flex flex-col overflow-hidden",
  "transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300",
].join(" ");

const MESSAGE_TEXTAREA_CLASS = [
  "w-full min-w-0 box-border resize-none bg-transparent border-0",
  "h-[150px] sm:h-[190px] min-[900px]:h-[208px] min-[1200px]:h-[224px]",
  "px-5 min-[900px]:px-6 pt-3.5 min-[900px]:pt-4 pb-3",
  "font-urbanist font-bold text-lg min-[900px]:text-[19px]",
  "text-[var(--fg)] placeholder:text-gray-400 [outline:none]",
].join(" ");

const FIELD_META_CLASS = [
  "contact-field-meta flex min-w-0 flex-1 flex-wrap justify-end",
  "gap-x-1.5 gap-y-0.5 text-[10px] min-[430px]:text-[11px]",
].join(" ");

const ATTACH_BUTTON_CLASS = [
  "contact-field-action inline-flex min-w-0 items-center gap-1.5",
  "text-[12px] min-[360px]:text-[13px] font-semibold",
  "hover:opacity-90 transition cursor-pointer",
].join(" ");

const MOBILE_ICON_CLASS =
  "h-5 w-5 min-[340px]:h-[22px] min-[340px]:w-[22px]";

const FILE_CHIP_CLASS = [
  "contact-file-chip flex items-center gap-1.5 rounded-md border border-steelblue/60",
  "bg-[var(--surface)]/80 px-2 py-1",
].join(" ");

// The stylesheet's border-left would sit on the wrong side in Arabic; the
// logical border is the same in left-to-right languages.
const ERROR_BORDER_STYLE: React.CSSProperties = {
  borderLeft: 0,
  borderInlineStart: "2px solid var(--contact-gh-danger)",
};

const SENT_NOTICE_CLASS = [
  "contact-form-success mt-[5px] rounded-[2px] border-s-2 border-[var(--contact-gh-green)]",
  "bg-[rgba(var(--contact-gh-green-rgb),0.09)] px-[7px] py-[5px]",
  "text-[0.7rem] font-semibold text-[var(--contact-gh-green)] [overflow-wrap:anywhere]",
].join(" ");

function toSendResult(result: boolean | ContactSendResult | undefined): ContactSendResult {
  if (typeof result === "object") return result;
  return result ? { ok: true } : { ok: false, reason: "failed" };
}

/** "You can also email me at {email}." with the address as a mailto link. */
function EmailFallback({ template, email }: { template: string; email: string }) {
  const [before, after = ""] = template.split("{email}");
  return (
    <span className="mt-1 block">
      {before}
      <a href={`mailto:${email}`} dir="ltr" className="underline underline-offset-2">
        {email}
      </a>
      {after}
    </span>
  );
}

const trimName = (v: string, max = 16) => {
  if (v.length <= max) return v;
  const head = Math.ceil((max - 1) * 0.6);
  const tail = (max - 1) - head;
  return v.slice(0, head) + "…" + v.slice(-tail);
};

const EmailForm: NextPage<Props> = ({
  attachmentsEnabled = false,
  className = "",
  idPrefix = "contact",
  onSend,
  showMobileIcons = false,
  initialLinks,
}) => {
  const { dictionary, format } = useI18n();
  const copy = dictionary.contact;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendFailure, setSendFailure] = useState<ContactFailureReason | null>(null);
  // Stays until the visitor edits the form again (the button resets sooner).
  const [sentNotice, setSentNotice] = useState(false);
  const [invalidField, setInvalidField] = useState<"name" | "email" | "message" | null>(null);
  const links = useContactLinks(showMobileIcons, initialLinks);
  // Same source as the e-mail social link: the loaded links, or the static
  // fallback when the server could not load them.
  const contactEmail = contactEmailFromLinks(
    links.length > 0 ? links : initialLinks ?? FALLBACK_CONTACT_LINKS,
  );
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");

  const inputFileRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const writeTabRef = useRef<HTMLButtonElement | null>(null);
  const previewTabRef = useRef<HTMLButtonElement | null>(null);
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (sentTimerRef.current !== null) clearTimeout(sentTimerRef.current);
  }, []);

  const { files, totalBytes, totalOk, addFiles, removeFile, clearFiles, fileKey } = useContactFiles(
    maxTotalMb,
    (selected) => format(copy.attachmentsTooLargeSelected, { size: maxTotalMb, selected }),
  );

  const stopSpaceBubble = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.code === "Space") e.stopPropagation();
  };

  function handleFilesChange(fileList: FileList | null) {
    if (!attachmentsEnabled) return;
    setSentNotice(false);
    setError(null);
    // Check what the server would reject, so the visitor learns why now.
    const incoming = Array.from(fileList ?? []);
    if (files.length + incoming.length > CONTACT_MAX_FILES) {
      setError(format(copy.attachmentsTooMany, { count: CONTACT_MAX_FILES }));
      return;
    }
    if (incoming.some((file) => !validContactFileMetadata({ name: file.name, size: file.size, type: file.type }))) {
      setError(copy.sendAttachmentRejected);
      return;
    }
    const fileError = addFiles(fileList);
    if (fileError) setError(fileError);
  }

  function focusInvalidField(field: "name" | "email" | "message") {
    setInvalidField(field);
    // The textarea only exists in the Write tab; mount it before focusing.
    if (field === "message") setEditorMode("write");
    requestAnimationFrame(() => {
      const target = field === "name"
        ? nameRef.current
        : field === "email"
          ? emailRef.current
          : messageRef.current;
      target?.focus({ preventScroll: false });
    });
  }

  function handleEditorTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    // Two tabs: either arrow moves to the other one (direction-agnostic, so
    // it behaves the same in LTR and RTL).
    const next = editorMode === "write" ? "preview" : "write";
    setEditorMode(next);
    (next === "write" ? writeTabRef : previewTabRef).current?.focus();
  }

  function clearFieldError(field: "name" | "email" | "message") {
    setSentNotice(false);
    if (invalidField !== field) return;
    setInvalidField(null);
    setError(null);
  }

  async function handleSendClick() {
    setError(null);
    setSendFailure(null);
    setSentNotice(false);
    setInvalidField(null);
    if (!name.trim()) {
      setError(copy.required);
      focusInvalidField("name");
      return;
    }
    if (!email.trim()) {
      setError(copy.required);
      focusInvalidField("email");
      return;
    }
    if (!message.trim()) {
      setError(copy.required);
      focusInvalidField("message");
      return;
    }
    if (!totalOk) {
      setError(
        format(copy.attachmentsTooLargeSelected, {
          size: maxTotalMb,
          selected: (totalBytes / (1024 * 1024)).toFixed(1),
        }),
      );
      return;
    }
    if (!isValidEmail(email)) {
      setError(copy.invalidEmail);
      focusInvalidField("email");
      return;
    }

    setStatus("sending");
    try {
      const result = toSendResult(await onSend?.({ name, email, message, files }));
      if (result.ok) {
        setStatus("sent");
        setSentNotice(true);
        setName("");
        setEmail("");
        setMessage("");
        clearFiles();
        if (sentTimerRef.current !== null) clearTimeout(sentTimerRef.current);
        sentTimerRef.current = setTimeout(() => {
          sentTimerRef.current = null;
          setStatus("idle");
        }, 1500);
      } else {
        setStatus("idle");
        setSendFailure(result.reason);
      }
    } catch {
      setStatus("idle");
      setSendFailure("failed");
    }
  }

  const failureMessages: Record<ContactFailureReason, string> = {
    rate_limited: copy.sendRateLimited,
    captcha_failed: copy.sendCaptchaFailed,
    captcha_invalid: copy.sendCaptchaInvalid,
    busy: copy.sendBusy,
    attachments_unavailable: copy.sendAttachmentsUnavailable,
    attachment_rejected: copy.sendAttachmentRejected,
    cookies_blocked: copy.sendCookiesBlocked,
    network: copy.sendNetwork,
    timeout: copy.sendTimeout,
    failed: copy.sendFailed,
  };

  const messageLeft = Math.max(0, MESSAGE_MAX - message.length);
  const identityComplete = Boolean(name.trim() && isValidEmail(email));
  const messageComplete = Boolean(message.trim());
  const readyToCommit = identityComplete && messageComplete && totalOk;
  const hasChanges = Boolean(name.trim() || email.trim() || message.trim() || files.length > 0);
  return (
    <form
      aria-label={copy.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void handleSendClick();
      }}
      className={[
        "contact-form w-full max-w-full min-w-0 box-border text-left font-urbanist",
        className,
      ].join(" ")}
    >
      {/* Shown only when the app's JavaScript cannot run (noscript style in
          the layout, legacy rules in app/global.css). */}
      {contactEmail && (
        <p className="contact-js-notice contact-form-error hidden" style={ERROR_BORDER_STYLE}>
          {format(copy.formNeedsJs, { email: contactEmail })}
        </p>
      )}
      <div className="contact-form-worktree">
        <section className="contact-commit-panel" aria-label={copy.openMessage}>
          <div className="contact-commit-toolbar">
            {showMobileIcons && (
              <span className="contact-mobile-repository-context">
                <svg aria-hidden viewBox="0 0 16 16"><path d="M3 2.25h7l3 3v8.5H3V2.25Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /><path d="M10 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.25" /></svg>
                <span>Mouaz7</span>
                <i aria-hidden>/</i>
                <strong>{copy.repositoryName}</strong>
              </span>
            )}
            <span className="contact-branch-selector">
              <svg aria-hidden viewBox="0 0 16 16"><circle cx="4" cy="3" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="4" cy="13" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="12" cy="5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M4 4.5v7M5.5 8h2A4.5 4.5 0 0 0 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
              {copy.commitToBranch}
            </span>
            <span className="contact-toolbar-status"><i aria-hidden />{copy.gitStatus}</span>
          </div>

          <div className="contact-commit-body">
            <div className="contact-commit-heading">
              <div>
                <span className="contact-commit-kicker">{copy.kicker}</span>
                <h2>{copy.openMessage}</h2>
              </div>
              <span className="contact-new-badge">{copy.newMessage}</span>
            </div>

            <div className={`contact-form-fields ${FORM_WIDTH_CLASS}`}>
              <div className="contact-identity-grid">
                <NameContainer
                  id={`${idPrefix}-name`}
                  inputRef={nameRef}
                  titlePlaceholder={copy.yourName}
                  placeholder={copy.name}
                  required
                  valueForRequired={name}
                  inputProps={{
                    value: name,
                    onChange: (e) => {
                      setName(e.currentTarget.value.slice(0, NAME_MAX));
                      clearFieldError("name");
                    },
                    maxLength: NAME_MAX,
                    "aria-invalid": invalidField === "name",
                    "aria-describedby": invalidField === "name" ? `${idPrefix}-error` : undefined,
                    autoComplete: "name",
                    onKeyDown: stopSpaceBubble,
                    className: FIELD_INPUT_CLASS,
                  }}
                />
                <NameContainer
                  id={`${idPrefix}-email`}
                  inputRef={emailRef}
                  titlePlaceholder={copy.yourEmail}
                  placeholder={copy.email}
                  required
                  valueForRequired={email}
                  inputProps={{
                    type: "email",
                    value: email,
                    onChange: (e) => {
                      setEmail(e.currentTarget.value.slice(0, EMAIL_MAX));
                      clearFieldError("email");
                    },
                    maxLength: EMAIL_MAX,
                    "aria-invalid": invalidField === "email",
                    "aria-describedby": invalidField === "email" ? `${idPrefix}-error` : undefined,
                    inputMode: "email",
                    autoComplete: "email",
                    onKeyDown: stopSpaceBubble,
                    className: FIELD_INPUT_CLASS,
                  }}
                />
              </div>

              <div className="contact-message-control">
                <label htmlFor={`${idPrefix}-message`}>
                  <b>{copy.yourMessage}</b>
                  <span>{format(copy.messageCount, { count: messageLeft, max: MESSAGE_MAX })}</span>
                </label>

                <div className={MESSAGE_BOX_CLASS}>
                  <div className="contact-editor-tabs" role="tablist" aria-label={copy.yourMessage}>
                    <button
                      ref={writeTabRef}
                      type="button"
                      role="tab"
                      aria-selected={editorMode === "write"}
                      aria-controls={editorMode === "write" ? `${idPrefix}-write-panel` : undefined}
                      tabIndex={editorMode === "write" ? 0 : -1}
                      id={`${idPrefix}-write-tab`}
                      onClick={() => setEditorMode("write")}
                      onKeyDown={handleEditorTabKeyDown}
                    >
                      {copy.write}
                    </button>
                    <button
                      ref={previewTabRef}
                      type="button"
                      role="tab"
                      aria-selected={editorMode === "preview"}
                      aria-controls={editorMode === "preview" ? `${idPrefix}-preview-panel` : undefined}
                      tabIndex={editorMode === "preview" ? 0 : -1}
                      id={`${idPrefix}-preview-tab`}
                      onClick={() => setEditorMode("preview")}
                      onKeyDown={handleEditorTabKeyDown}
                    >
                      {copy.preview}
                    </button>
                    <span className="contact-editor-language" aria-hidden>Markdown</span>
                  </div>

                  {editorMode === "write" ? (
                    <div id={`${idPrefix}-write-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-write-tab`}>
                      <textarea
                        ref={messageRef}
                        id={`${idPrefix}-message`}
                        className={MESSAGE_TEXTAREA_CLASS}
                        placeholder={copy.message}
                        value={message}
                        maxLength={MESSAGE_MAX}
                        onChange={(e) => {
                          setMessage(e.currentTarget.value.slice(0, MESSAGE_MAX));
                          clearFieldError("message");
                        }}
                        onKeyDown={stopSpaceBubble}
                        required
                        aria-invalid={invalidField === "message"}
                        aria-describedby={invalidField === "message" ? `${idPrefix}-error` : undefined}
                      />
                    </div>
                  ) : (
                    <div
                      id={`${idPrefix}-preview-panel`}
                      role="tabpanel"
                      aria-labelledby={`${idPrefix}-preview-tab`}
                      className="contact-message-preview"
                    >
                      {message.trim() ? <p>{message}</p> : <span>{copy.previewEmpty}</span>}
                    </div>
                  )}

                  <div className="contact-changed-files">
                    <div className="contact-changed-files-heading">
                      <span>
                        <svg aria-hidden viewBox="0 0 16 16"><path d="M3.5 1.75h6L12.5 4.8v9.45H3.5V1.75Z" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M9.5 1.9v3h2.8" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
                        {copy.changedFiles}
                        {hasChanges && <small>{copy.fileChanged}</small>}
                      </span>
                      <strong>{files.length + (hasChanges ? 1 : 0)}</strong>
                    </div>

                    <div className="contact-tracked-file" data-modified={hasChanges ? "true" : undefined}>
                      <span aria-hidden>
                        {hasChanges ? "M" : (
                          <svg viewBox="0 0 16 16"><path d="M3 2.25h7l3 3v8.5H3V2.25Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" /><path d="M10 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.25" /></svg>
                        )}
                      </span>
                      <code>contact.md</code>
                      <small>{hasChanges ? copy.contactModified : copy.workingTreeClean}</small>
                    </div>

                    {files.length === 0 ? (
                      <div className="contact-no-files"><span aria-hidden>∅</span>{copy.noFilesChanged}</div>
                    ) : (
                      <div className="contact-file-list">
                        {files.map((file) => {
                          const key = fileKey(file);
                          return (
                            <div key={key} className={FILE_CHIP_CLASS} title={file.name}>
                              <span className="contact-file-status">A</span>
                              <svg aria-hidden viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                              <span className="contact-file-name">{trimName(file.name, 24)}</span>
                              <span className="contact-field-meta">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                              <button type="button" onClick={() => removeFile(key)} aria-label={format(copy.removeFile, { name: file.name })} title={copy.remove}>×</button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="contact-attachment-toolbar">
                      <div>
                        <button
                          type="button"
                          onClick={() => inputFileRef.current?.click()}
                          className={ATTACH_BUTTON_CLASS}
                          title={attachmentsEnabled ? copy.attachFiles : copy.attachmentsDisabled}
                          disabled={!attachmentsEnabled}
                          aria-disabled={!attachmentsEnabled}
                        >
                          <svg aria-hidden viewBox="0 0 24 24"><path d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 01-7.78-7.78l9.19-9.19a3.5 3.5 0 114.95 4.95l-9.2 9.2a1.5 1.5 0 01-2.12-2.12l8.5-8.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          {copy.attachFiles}
                        </button>
                        <span className="contact-attachment-limit">{format(copy.max, { size: maxTotalMb })}</span>
                        <input ref={inputFileRef} type="file" name="attachments" aria-label={copy.attachments} multiple disabled={!attachmentsEnabled} onChange={(e) => handleFilesChange(e.currentTarget.files)} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" className="hidden" />
                      </div>
                      {files.length > 0 && <span className={FIELD_META_CLASS}>{format(copy.selectedSize, { size: (totalBytes / (1024 * 1024)).toFixed(2) })}</span>}
                    </div>
                  </div>
                </div>

                {!totalOk ? (
                  <div id={`${idPrefix}-error`} role="alert" className="contact-form-error" style={ERROR_BORDER_STYLE}>
                    {format(copy.attachmentsTooLarge, { size: maxTotalMb })}
                  </div>
                ) : error ? (
                  <div id={`${idPrefix}-error`} role="alert" className="contact-form-error" style={ERROR_BORDER_STYLE}>{error}</div>
                ) : sendFailure ? (
                  <div id={`${idPrefix}-error`} role="alert" className="contact-form-error" style={ERROR_BORDER_STYLE}>
                    {failureMessages[sendFailure]}
                    {contactEmail && <EmailFallback template={copy.emailFallback} email={contactEmail} />}
                  </div>
                ) : sentNotice ? (
                  <p className={SENT_NOTICE_CLASS}>{copy.sentThanks}</p>
                ) : null}
              </div>
            </div>

            <div className="contact-commit-actions contact-mobile-actions">
              <div className="contact-mobile-send">
                <SendButton className="contact-send-button" gapPx={0} iconSize={18} type="submit" status={status} label={copy.commitAndSend} sentLabel={copy.sent} sendingLabel={copy.sending} />
              </div>

              {showMobileIcons && links.length > 0 && (
                <div className="contact-mobile-socials" style={{ WebkitOverflowScrolling: "touch" }}>
                  {links.map((link) => (
                    <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.title} title={link.title} className="contact-mobile-social-link">
                      <SocialIcon link={link} size={24} className={`${MOBILE_ICON_CLASS} select-none pointer-events-none`} />
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="contact-command-strip" aria-live="polite">
              <code>$ git status --short contact.md</code>
              <span data-ready={readyToCommit ? "true" : undefined}>{hasChanges ? copy.contactModified : copy.workingTreeClean}</span>
              <small>{readyToCommit ? copy.readyToCommit : copy.branch}</small>
            </div>
          </div>
        </section>
      </div>
      {/* Always in the page, so screen readers announce each change. */}
      <span role="status" aria-live="polite" className="sr-only">
        {status === "sending" ? copy.sendingMessage : sentNotice ? copy.sentThanks : ""}
      </span>
    </form>
  );
};

export default EmailForm;
