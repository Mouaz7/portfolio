// components/journey/GitGraph.tsx
"use client";

import { tint } from "@/lib/journey/tint";
import { useMemo } from "react";
import {
  deriveGraph,
  fmtMonthYear,
  type JourneyItem,
} from "@/lib/journey/deriveGitGraph";
import { JOURNEY_MOBILE_STAGE } from "./constants";
import { railGeometry } from "./GraphRail";
import CommitRow from "./CommitRow";
import { useI18n } from "@/components/i18n/I18nProvider";
import { localeTag } from "@/lib/i18n/config";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// Repo identity lives in exactly one place (it's chrome, not per-commit data).
const REPO = { owner: "Mouaz-Naji", branch: "main" };

function RepoGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 2.75A1.75 1.75 0 0 1 4.25 1H13a.75.75 0 0 1 .75.75v9.5a.75.75 0 0 1-.75.75H4.5a1 1 0 0 0-1 1 1 1 0 0 0 1 1h8.75a.75.75 0 0 1 0 1.5H4.5A2.5 2.5 0 0 1 2 13V2.75Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

function BranchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5 3.5v9M11 3.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM5 3.5a1.5 1.5 0 1 1 0-.001M5 12.5a1.5 1.5 0 1 1 0 .001M11 6.5c0 2.5-2.5 3-6 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function GitGraph({
  items,
  mobileStage = false,
  loadError,
  onRetry,
}: {
  items: JourneyItem[];
  mobileStage?: boolean;
  /** Shown instead of "No commits yet" when the Journey could not be loaded. */
  loadError?: string;
  onRetry?: () => void;
}) {
  const { locale, dictionary, format } = useI18n();
  const copy = dictionary.journey;
  const model = useMemo(() => deriveGraph(items), [items]);
  const geo = railGeometry(model.laneCount, mobileStage);

  const { commits, branches } = model;
  const { commits: cCount, branches: bCount, updated } = model.stats;

  return (
    <section
      aria-label={copy.title}
      className="git-graph mx-auto flex w-full flex-col"
      data-journey-mode={mobileStage ? "mobile-stage" : "desktop"}
    >
      {/* Repo header — the single elevated panel of the view */}
      <header
        className="git-head shrink-0 overflow-hidden rounded-[15px] px-4 py-3.5 max-[675px]:rounded-[14px] max-[675px]:px-3 max-[675px]:py-2.5"
        style={{
          background: tint("var(--surface)", 82),
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid var(--surface-border)",
          height: mobileStage ? JOURNEY_MOBILE_STAGE.headerHeight : undefined,
        }}
      >
        <div className="flex items-center justify-between gap-3 max-[675px]:gap-2">
          <div
            className="flex min-w-0 items-center gap-2 max-[675px]:gap-1.5"
            style={{ color: "var(--fg-70)" }}
          >
            <RepoGlyph />
            <span
              className="truncate text-[14.5px] max-[675px]:text-[12.5px]"
              style={{ fontFamily: MONO }}
            >
              <span style={{ color: "var(--fg-70)" }}>{REPO.owner}</span>
              <span style={{ color: "var(--fg-50)" }}> / </span>
              <span className="font-semibold" style={{ color: "var(--accent)" }}>
                {copy.title}
              </span>
            </span>
          </div>

          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] max-[675px]:gap-1 max-[675px]:px-1.5 max-[675px]:py-1 max-[675px]:text-[10px]"
            style={{
              fontFamily: MONO,
              color: "var(--fg-70)",
              background: "var(--surface-2)",
              border: "1px solid var(--surface-border)",
            }}
          >
            <BranchGlyph />
            {REPO.branch}
          </span>
        </div>

        <div
          className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] max-[675px]:mt-1.5 max-[675px]:gap-x-1 max-[675px]:text-[10px]"
          style={{ fontFamily: MONO, color: "var(--fg-50)" }}
        >
          <span style={{ color: "var(--accent)" }}>◇</span>
          <span style={{ color: "var(--fg-70)" }}>{cCount}</span> {copy.commits}
          <span aria-hidden>·</span>
          <span style={{ color: "var(--fg-70)" }}>{bCount}</span> {copy.branches}
          {updated && (
            <>
              <span aria-hidden>·</span>
              <span>{format(copy.updated, { date: fmtMonthYear(updated, localeTag(locale)) })}</span>
            </>
          )}
        </div>
      </header>

      {/* Commit log */}
      {commits.length === 0 && loadError ? (
        <div
          className="mt-6 flex flex-col items-center gap-4 rounded-[14px] px-4 py-8 text-center text-[13px]"
          style={{
            fontFamily: MONO,
            color: "var(--fg)",
            border: "1px dashed var(--surface-border)",
          }}
        >
          {/* dir="auto": the page forces LTR, which misplaces Arabic punctuation. */}
          <p role="alert" dir="auto">{loadError}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              // Outlined: the Journey page darkens --accent in the light theme,
              // so a fixed ink on an accent fill would lose contrast there.
              className="rounded-full border border-[var(--fg-50)] px-5 py-2 font-semibold text-[var(--fg)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {dictionary.common.retry}
            </button>
          )}
        </div>
      ) : commits.length === 0 ? (
        <p
          className="mt-6 rounded-[14px] px-4 py-8 text-center text-[13px]"
          style={{
            fontFamily: MONO,
            color: "var(--fg-50)",
            border: "1px dashed var(--surface-border)",
          }}
        >
          {copy.noCommits}
        </p>
      ) : (
        <ol
          className="git-log mt-3.5 flex list-none flex-col pb-1 max-[675px]:mt-0"
          style={{
            gap: mobileStage ? JOURNEY_MOBILE_STAGE.rowGap : undefined,
            paddingTop: mobileStage ? JOURNEY_MOBILE_STAGE.headerGap : undefined,
          }}
        >
          {commits.map((c) => (
            <CommitRow
              key={c.id}
              commit={c}
              branches={branches}
              geo={geo}
              mobileStage={mobileStage}
            />
          ))}
        </ol>
      )}

      <style>{`
        .git-head { opacity: 0; animation: ggIn 520ms cubic-bezier(0.16,1,0.3,1) both; }
        .git-log .commit-row { opacity: 0; animation: ggRow 460ms cubic-bezier(0.16,1,0.3,1) both; }
        ${commits
          .map(
            (_, i) =>
              `.git-log .commit-row:nth-child(${i + 1}) { animation-delay: ${180 + i * 70}ms; }`
          )
          .join("\n")}
        .commit-card { transition: border-color 200ms ease, transform 200ms cubic-bezier(0.16,1,0.3,1); }
        .commit-row:hover .commit-card { border-color: color-mix(in srgb, var(--accent) 42%, var(--surface-border)); transform: translateY(-1px); }
        @supports not (color: color-mix(in srgb, red, red)) { .commit-row:hover .commit-card { border-color: var(--surface-border); } }
        .rail-dot { transition: transform 200ms cubic-bezier(0.16,1,0.3,1); }
        .commit-row:hover .rail-dot { transform: translate(-50%,-50%) scale(1.18); }
        .head-pulse { animation: ggPulse 1.8s ease-in-out infinite; }
        @keyframes ggIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
        @keyframes ggRow { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes ggPulse { 0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(var(--accent-2-rgb), 0.55); } 50% { opacity: 0.7; box-shadow: 0 0 0 4px transparent; } }
        @media (prefers-reduced-motion: reduce) {
          .git-head, .git-log .commit-row { opacity: 1 !important; animation: none !important; transform: none !important; }
          .rail-dot, .commit-row:hover .rail-dot { transition: none; }
          .head-pulse { animation: none; }
        }
      `}</style>
    </section>
  );
}
