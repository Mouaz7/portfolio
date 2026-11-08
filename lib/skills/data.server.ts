import "server-only";

import { cachedLoader } from "@/lib/cached-loader.server";
import { supabase } from "@/lib/backend/supabaseClient";
import type { Locale } from "@/lib/i18n/config";
import {
  getContentTranslations,
  translatedFields,
} from "@/lib/i18n/content-translations.server";
import skillIconSources from "@/docs/skill-icon-sources.json";

const ALLOWED_CATEGORY_KEYS = [
  "frontend",
  "mobile",
  "backend",
  "storage",
  "devops",
  "ai",
  "ides",
  "workflow",
  "webdata",
] as const;

const LOCAL_ICON_PATHS = new Map(
  skillIconSources.map((icon) => [
    `${icon.category}\u0000${icon.name}`,
    { primary: icon.localPath, light: icon.localPathLight },
  ]),
);

function resolveIconPath(
  category: string | null,
  name: string,
  path: string | null | undefined,
  variant: "primary" | "light",
) {
  const catalogPath = LOCAL_ICON_PATHS.get(`${category ?? ""}\u0000${name}`)?.[variant];
  if (catalogPath) return catalogPath;

  // Same-origin paths remain valid during rolling deploys. Legacy remote and
  // Storage URLs fail closed so a stale database row cannot reintroduce an
  // external Skills request before its migration has reached production.
  const value = path?.trim() ?? "";
  return value.startsWith("/skill-icons/") ? value : undefined;
}

export type SkillData = {
  id: string;
  name: string;
  category: string | null;
  src: string;
  alt: string;
  mono: boolean;
  srcLight?: string;
  weight: number;
};

export type SkillCategoryData = {
  key: string;
  title: string;
  blurb: string;
};

export const getSkills = cachedLoader(async (): Promise<SkillData[]> => {
  const { data, error } = await supabase
    .from("skill")
    .select("id,name,category,icon_path,icon_path_light,icon_alt,mono,sort_order,created_at")
    .eq("is_active", true)
    .in("category", [...ALLOWED_CATEGORY_KEYS])
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row, index) => {
    const src = resolveIconPath(row.category, row.name, row.icon_path, "primary") ?? "";

    return {
      id: row.id,
      name: row.name,
      category: row.category,
      src,
      alt: row.icon_alt ?? row.name,
      mono: row.mono ?? false,
      srcLight: resolveIconPath(row.category, row.name, row.icon_path_light, "light"),
      weight: index,
    };
  });
}, ["skills"], "skills");

export async function getSkillCategories(locale: Locale): Promise<SkillCategoryData[]> {
  return cachedLoader(async () => {
    const { data, error } = await supabase
      .from("skill_category")
      .select("name,title,blurb,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    const translations = await getContentTranslations(locale, ["skill_category"]);
    const mapped = (data ?? [])
      .filter((category) => ALLOWED_CATEGORY_KEYS.includes(
        category.name as (typeof ALLOWED_CATEGORY_KEYS)[number],
      ))
      .map((category) => {
        const translated = translatedFields(
          translations,
          "skill_category",
          category.name,
        );
        return {
          key: category.name,
          title: String(translated.title ?? category.title ?? category.name).trim(),
          blurb: String(translated.blurb ?? category.blurb ?? "").trim(),
        };
      });

    return mapped;
  }, ["skill-categories", locale], "skills")();
}
