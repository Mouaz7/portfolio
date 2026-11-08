// Grouping, filtering and sorting for the /projects list. Pure functions, so
// the rules can be tested without rendering the page.

import { githubUrlToFullName } from "@/lib/projects/githubSync";
import type { RepositoryStats } from "@/lib/projects/repository-stats.server";
import type { Project } from "@/lib/projects/types";

export type RepositoryTypeFilter = "all" | "public" | "source" | "fork" | "archived";
export type RepositorySort = "default" | "name" | "stars" | "forks" | "updated";

export function groupProjectsByCategory(projects: readonly Project[]): Record<string, Project[]> {
  return projects.reduce((groups, project) => {
    (groups[project.category] ??= []).push(project);
    return groups;
  }, {} as Record<string, Project[]>);
}

export type ProjectListOptions = {
  search: string;
  language: string;
  type: RepositoryTypeFilter;
  sort: RepositorySort;
  stats: Record<string, RepositoryStats>;
  /** BCP 47 tag used to sort names. */
  collation: string;
};

function matchesType(project: Project, type: RepositoryTypeFilter, stats: RepositoryStats | undefined) {
  switch (type) {
    case "all":
      return true;
    case "public":
      return project.visibility !== "private";
    case "source":
      return Boolean(stats && !stats.isFork && !stats.isArchived);
    case "fork":
      return Boolean(stats?.isFork);
    case "archived":
      return Boolean(stats?.isArchived);
  }
}

/** The projects that match the search, language and repository type, in the chosen order. */
export function filterAndSortProjects(projects: readonly Project[], options: ProjectListOptions): Project[] {
  const { search, language, type, sort, stats, collation } = options;
  const normalizedSearch = search.trim().toLowerCase();
  const statsOf = (project: Project) => stats[githubUrlToFullName(project.github_url)];

  return projects
    .filter((project) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [project.title, project.description, ...project.languages]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesLanguage =
        language === "all" ||
        project.languages.some((entry) => entry.toLowerCase() === language.toLowerCase());
      return matchesSearch && matchesLanguage && matchesType(project, type, statsOf(project));
    })
    .sort((left, right) => {
      const leftStats = statsOf(left);
      const rightStats = statsOf(right);
      switch (sort) {
        case "name":
          return left.title.localeCompare(right.title, collation);
        case "stars":
          return (rightStats?.stars ?? -1) - (leftStats?.stars ?? -1);
        case "forks":
          return (rightStats?.forks ?? -1) - (leftStats?.forks ?? -1);
        case "updated":
          return Date.parse(rightStats?.updatedAt ?? "1970-01-01") - Date.parse(leftStats?.updatedAt ?? "1970-01-01");
        default:
          return 0;
      }
    });
}
