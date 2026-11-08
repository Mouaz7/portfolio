// components/skills/SkillsGrid.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useViewportStage } from "./useViewportStage";
import { SkillCard } from "./SkillCard";
import PageLoadingStage from "@/components/ui/PageLoadingStage";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useI18n } from "@/components/i18n/I18nProvider";
import styles from "./SkillsGrid.module.css";
import type {
  SkillCategoryData,
  SkillData,
} from "@/lib/skills/data.server";
import { fetchJson, reportFetchFailure } from "@/lib/client/fetch-json";

const BASE = { cardW: 360, gap: 24, cardRatio: 6 / 5, padY: 40 };
type Spec = {
  cols: number;
  rows: number;
  cardW?: number;
  gap?: number;
  cardRatio?: number;
  minScale?: number;
  maxScale?: number;
  padX?: number;
  padY?: number;
};
type CategoryMeta = SkillCategoryData;
// The media-query hooks intentionally start from their SSR-safe `false` value.
// Clamp this intermediate desktop composition so an ultrawide client never
// paints an enlarged grid before the wide profile is selected after hydration.
const DESKTOP_SPEC: Spec = { cols: 3, rows: 3, minScale: 0, maxScale: 1 };
const TALL_DESKTOP_SPEC: Spec = {
  cols: 3,
  rows: 3,
  cardRatio: 4 / 3,
  minScale: 0,
  maxScale: 1.5,
};
const WIDE_DESKTOP_SPEC: Spec = {
  cols: 3,
  rows: 3,
  cardW: 620,
  gap: 16,
  cardRatio: 19 / 10,
  minScale: 0,
  padX: 32,
  padY: 28,
};
const EXTRA_WIDE_DESKTOP_SPEC: Spec = {
  cols: 3,
  rows: 3,
  cardW: 760,
  gap: 18,
  cardRatio: 2,
  minScale: 0,
  padX: 32,
  padY: 32,
};
const ULTRA_WIDE_DESKTOP_SPEC: Spec = {
  cols: 3,
  rows: 3,
  cardW: 900,
  gap: 22,
  cardRatio: 2,
  minScale: 0,
  maxScale: 1,
  padX: 40,
  padY: 36,
};
const MOBILE_SPEC: Spec = {
  cols: 2,
  rows: 5,
  gap: 10,
  cardRatio: 5 / 4,
  minScale: 0.5,
  padX: 4,
  padY: 6,
};

const CATEGORY_DISPLAY_ORDER = [
  "frontend",
  "mobile",
  "backend",
  "storage",
  "devops",
  "webdata",
  "ides",
  "workflow",
  "ai",
] as const;

const CATEGORY_DISPLAY_POSITION = new Map<string, number>(
  CATEGORY_DISPLAY_ORDER.map((key, index) => [key, index]),
);

// Minimal skill shape used by our UI
type UISkill = SkillData;

type SkillsGridProps = {
  initialCategories?: CategoryMeta[];
  initialSkills?: UISkill[];
  initialProjectSkillNames?: string[];
};

export default function SkillsGrid({
  initialCategories,
  initialSkills,
  initialProjectSkillNames = [],
}: SkillsGridProps) {
  const { locale, dictionary } = useI18n();
  const [allSkills, setAllSkills] = useState<UISkill[]>(initialSkills ?? []);
  const [cats, setCats] = useState<CategoryMeta[]>(initialCategories ?? []);
  const [categoriesLoading, setCategoriesLoading] = useState(initialCategories === undefined);
  const [skillsLoading, setSkillsLoading] = useState(initialSkills === undefined);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [skillsFailed, setSkillsFailed] = useState(false);
  // Bumped by the Retry button to run the client fetches again.
  const [attempt, setAttempt] = useState(0);
  const loading = categoriesLoading || skillsLoading;
  const loadFailed = categoriesFailed || skillsFailed;

  // Fetch categories (DB: skill_category with title/blurb)
  useEffect(() => {
    if (initialCategories) {
      setCats(initialCategories);
      setCategoriesLoading(false);
      return;
    }
    let off = false;
    setCategoriesLoading(true);
    setCategoriesFailed(false);
    (async () => {
      try {
        const items = await fetchJson<CategoryMeta[]>(`/api/skill-categories?locale=${locale}`);
        if (!off) setCats(items);
      } catch (e) {
        reportFetchFailure("skill categories", e);
        if (!off) {
          setCats([]);
          setCategoriesFailed(true);
        }
      } finally {
        if (!off) setCategoriesLoading(false);
      }
    })();
    return () => { off = true; };
  }, [attempt, initialCategories, locale]);

  // ✅ Fetch skills (Supabase-backed)
  useEffect(() => {
    if (initialSkills) {
      setAllSkills(initialSkills);
      setSkillsLoading(false);
      return;
    }
    let off = false;
    setSkillsLoading(true);
    setSkillsFailed(false);
    (async () => {
      try {
        const items = await fetchJson<UISkill[]>("/api/skills");
        if (!off) setAllSkills(items);
      } catch (e) {
        reportFetchFailure("skills", e);
        if (!off) {
          setAllSkills([]);
          setSkillsFailed(true);
        }
      } finally {
        if (!off) setSkillsLoading(false);
      }
    })();
    return () => { off = true; };
  }, [attempt, initialSkills]);

  // Bucket skills by fetched categories
  const byCat = useMemo(() => {
    const map: Record<string, UISkill[]> = {};
    for (const c of cats) map[c.key] = [];
    for (const s of allSkills) {
      if (s.category && map[s.category]) map[s.category].push(s);
    }
    Object.keys(map).forEach(k => map[k].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)));
    return map;
  }, [cats, allSkills]);
  const projectSkillNames = useMemo(
    () => new Set(initialProjectSkillNames),
    [initialProjectSkillNames],
  );
  const orderedCategories = useMemo(
    () => [...cats].sort((a, b) => {
      const fallbackPosition = CATEGORY_DISPLAY_ORDER.length;
      return (CATEGORY_DISPLAY_POSITION.get(a.key) ?? fallbackPosition)
        - (CATEGORY_DISPLAY_POSITION.get(b.key) ?? fallbackPosition);
    }),
    [cats],
  );

  // Phones retain the two-column composition. Tablets, iPads, and larger
  // platforms share the same three-column composition as desktop.
  const desktopComposition = useMediaQuery("(min-width: 640px)");
  const wideDesktopComposition = useMediaQuery(
    "(min-width: 1000px) and (min-aspect-ratio: 8/5)",
  );
  const tallDesktopComposition = useMediaQuery(
    "(min-width: 1200px) and (min-height: 1000px) and (max-aspect-ratio: 8/5)",
  );
  const extraWideDesktopComposition = useMediaQuery(
    "(min-width: 2200px) and (min-height: 1100px)",
  );
  const ultraWideDesktopComposition = useMediaQuery(
    "(min-width: 3200px) and (min-height: 1500px)",
  );
  const spec = ultraWideDesktopComposition
    ? ULTRA_WIDE_DESKTOP_SPEC
    : extraWideDesktopComposition
      ? EXTRA_WIDE_DESKTOP_SPEC
      : wideDesktopComposition
        ? WIDE_DESKTOP_SPEC
        : tallDesktopComposition
          ? TALL_DESKTOP_SPEC
          : desktopComposition
            ? DESKTOP_SPEC
            : MOBILE_SPEC;
  const largeContent = wideDesktopComposition
    || extraWideDesktopComposition
    || ultraWideDesktopComposition;

  const STAGE = {
    ...BASE,
    cols: spec.cols,
    rows: spec.rows,
    cardW: spec.cardW ?? BASE.cardW,
    gap: spec.gap ?? BASE.gap,
    cardRatio: spec.cardRatio ?? BASE.cardRatio,
    minScale: spec.minScale,
    maxScale: spec.maxScale,
    padX: spec.padX,
    padY: spec.padY ?? BASE.padY,
  };
  const {
    isMeasured,
    profile,
    scale,
    baseW,
    baseH,
    needsVerticalScroll,
    stageStyle,
    wrapperStyle,
  } = useViewportStage(STAGE);

  // Retry replaces its own button with the loading stage; give keyboard
  // focus back to the page when the new result is shown.
  useEffect(() => {
    if (attempt > 0 && !loading) document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [attempt, loading]);

  if (loading) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-[calc(100dvh-54px)]">
        <h1 className="sr-only">{dictionary.skills.title}</h1>
        <PageLoadingStage
          text={dictionary.skills.loading}
          noun={dictionary.skills.title}
        />
      </main>
    );
  }

  if (loadFailed) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-[calc(100dvh-54px)] items-center justify-center p-4"
      >
        <h1 className="sr-only">{dictionary.skills.title}</h1>
        <div className="text-center">
          <p role="alert" className="mb-4 text-lg text-[var(--fg)]">
            {dictionary.skills.loadError}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[#04272d] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
          >
            {dictionary.common.retry}
          </button>
        </div>
      </main>
    );
  }

  // Loaded, but nothing to show (for example no categories in the database).
  if (cats.length === 0) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-[calc(100dvh-54px)] items-center justify-center p-4"
      >
        <h1 className="sr-only">{dictionary.skills.title}</h1>
        <div className="text-center">
          <h2 className="mb-2 text-2xl font-bold text-[var(--navigation-accent)]">
            {dictionary.skills.emptyTitle}
          </h2>
          <p className="text-[var(--fg-70)]">{dictionary.skills.emptyBody}</p>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      tabIndex={needsVerticalScroll ? 0 : -1}
      className={`${styles.stage} skills-stage page-fade-in flex flex-col items-center ${
        needsVerticalScroll ? "justify-start overflow-x-hidden overflow-y-auto" : "justify-center overflow-hidden"
      }`}
      data-initial-layout={isMeasured ? undefined : "pending"}
      data-viewport-profile={profile}
      data-viewport-scale={scale.toFixed(3)}
      data-skills-overflow={needsVerticalScroll ? "scroll" : "fit"}
      aria-label={needsVerticalScroll ? dictionary.skills.title : undefined}
      data-skills-layout={desktopComposition ? "desktop" : "phone"}
      data-skills-size={
        ultraWideDesktopComposition
          ? "ultra-wide"
          : extraWideDesktopComposition
            ? "extra-wide"
            : wideDesktopComposition
              ? "wide"
              : "default"
      }
      style={wrapperStyle(STAGE.padY, STAGE.padX)}
    >
      <h1 className="sr-only">{dictionary.skills.title}</h1>
      {/* Browsers without JavaScript cannot measure the stage; show the grid
          rather than leaving it hidden forever. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html: `<style>.${styles.fitted}{visibility:visible!important}</style>`,
        }}
      />
      <div
        className={`${styles.fitted} relative shrink-0`}
        // Supporting browsers fit the server-rendered grid with CSS before
        // hydration. Other browsers retain the measured JavaScript fallback.
        style={{
          width: baseW * scale,
          height: baseH * scale,
          visibility: isMeasured ? "visible" : "hidden",
        }}
      >
        <div className={`${styles.canvas} absolute left-0 top-0`} style={stageStyle}>
          <ul
            className="skills-bento-grid grid"
            style={{
              gridTemplateColumns: `repeat(${STAGE.cols}, ${STAGE.cardW}px)`,
              gridAutoRows: `${STAGE.cardW / STAGE.cardRatio}px`,
              gap: STAGE.gap,
            }}
          >
            {orderedCategories.map((c, i) => {
              const centeredFinalTwoColumnCard =
                spec.cols === 2
                && orderedCategories.length % 2 === 1
                && i === orderedCategories.length - 1;

              return (
                <li
                  key={c.key}
                  style={
                    centeredFinalTwoColumnCard
                      ? { gridColumn: "1 / -1", justifySelf: "center" }
                      : undefined
                  }
                >
                  <SkillCard
                    categoryKey={c.key}
                    title={c.title}
                    blurb={c.blurb}
                    items={byCat[c.key] ?? []}
                    cardW={STAGE.cardW}
                    cardRatio={STAGE.cardRatio}
                    cardIndex={i}
                    projectSkillNames={projectSkillNames}
                    largeContent={largeContent}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </main>
  );
}
