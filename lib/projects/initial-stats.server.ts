import "server-only";
import { githubUrlToFullName } from "@/lib/projects/githubSync";
import {
  getPublicRepositories,
  repositoryStatsFor,
  type RepositoryStats,
} from "@/lib/projects/repository-stats.server";
import type { Project } from "@/lib/projects/types";

// GitHub stats are cached for 30 minutes, so this is normally instant. If the
// GitHub API is slow, do not hold the page back: the browser fetches the stats
// after load instead.
const SERVER_STATS_BUDGET_MS = 1_500;

type Options = {
  budgetMs?: number;
  loadRepositories?: typeof getPublicRepositories;
};

/**
 * GitHub stats for the public projects, for the server render. Undefined when
 * GitHub is slower than the budget or fails, so the browser loads them later.
 */
export async function initialRepositoryStats(
  projects: Project[],
  { budgetMs = SERVER_STATS_BUDGET_MS, loadRepositories = getPublicRepositories }: Options = {},
): Promise<Record<string, RepositoryStats> | undefined> {
  const repositories = Array.from(new Set(
    projects
      .filter((project) => project.visibility !== "private")
      .map((project) => githubUrlToFullName(project.github_url))
      .filter(Boolean),
  ));
  if (repositories.length === 0) return {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), budgetMs);
  });
  try {
    const publicRepositories = await Promise.race([loadRepositories(repositories), budget]);
    // An empty list means GitHub failed; let the browser retry.
    if (!publicRepositories || publicRepositories.length === 0) return undefined;
    return repositoryStatsFor(repositories, publicRepositories);
  } finally {
    clearTimeout(timer);
  }
}
