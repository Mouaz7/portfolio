import "server-only";

import { cachedLoader } from "@/lib/cached-loader.server";
import { supabase } from "@/lib/backend/supabaseClient";
import { getSiteUrl } from "@/lib/site-url";
import type { Locale } from "@/lib/i18n/config";
import {
  getContentTranslations,
  translatedFields,
} from "@/lib/i18n/content-translations.server";
import type { Project } from "@/lib/projects/types";
import { canonicalProjectIconHref } from "./icon-assets";
import { withAegisDbPreview } from "./aegisdb-preview";
import {
  MANUAL_PORTFOLIO_TECHNOLOGIES,
  MANUAL_PORTFOLIO_URL,
  projectTechnologiesForDisplay,
} from "./githubSync";


function safeProjectUrl(value: unknown): string {
  const canonicalSite = getSiteUrl();
  try {
    const raw = String(value ?? "");
    const candidate = new URL(raw);
    if (candidate.protocol !== "https:") return canonicalSite;
    if (candidate.origin === new URL(canonicalSite).origin) return candidate.toString();
    if (candidate.hostname.toLowerCase() === "github.com") {
      const owner = candidate.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
      if (owner === "mouaz7") return candidate.toString();
    }
  } catch {
    // Invalid or unapproved targets safely return to the canonical portfolio.
  }
  return canonicalSite;
}

export class ProjectDatabaseError extends Error {
  constructor(override readonly cause: unknown) {
    super("Project database error");
  }
}

export async function getProjects(locale: Locale): Promise<Project[]> {
  return cachedLoader(async () => {
    const [{ data, error }, translations] = await Promise.all([
      supabase
        .from("project")
        .select(`
          id,
          title,
          description,
          category,
          github_url,
          github_full_name,
          source_kind,
          languages,
          cover_image_href,
          visibility,
          sort_order
        `)
        .eq("is_active", true)
        .eq("visibility", "public")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      getContentTranslations(locale, ["project"]).catch((translationError: unknown) => {
        throw new ProjectDatabaseError(translationError);
      }),
    ]);
    if (error) throw new ProjectDatabaseError(error);

    const projects: Project[] = (data ?? []).map((project) => {
      const translated = translatedFields(translations, "project", project.id);
      return {
        id: project.id,
        title: String(translated.title ?? project.title),
        description: String(translated.description ?? project.description ?? ""),
        category: project.category ?? "Build",
        github_url: project.source_kind === "manual"
          ? MANUAL_PORTFOLIO_URL
          : safeProjectUrl(project.github_url),
        languages: project.source_kind === "manual"
          ? [...MANUAL_PORTFOLIO_TECHNOLOGIES]
          : projectTechnologiesForDisplay(
            project.github_full_name
              ? `https://github.com/${project.github_full_name}`
              : project.github_url ?? "",
            (project.languages as string[]) ?? [],
          ),
        cover_image_url: project.cover_image_href
          ? canonicalProjectIconHref(project.cover_image_href)
          : undefined,
        visibility: project.visibility === "private"
          ? ("private" as const)
          : ("public" as const),
      };
    });
    return withAegisDbPreview(projects, locale, null);
  }, ["projects-v9", locale], "projects")();
}
