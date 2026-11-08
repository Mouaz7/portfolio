import "server-only";

import { GITHUB_OWNER } from "./githubSync";

export const REPOSITORY_STATS_REVALIDATE_SECONDS = 1800;
const MAX_REPOSITORIES = 24;

const GITHUB_TIMEOUT_MS = 5_000;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

interface GitHubRepositoryResponse {
  full_name: string;
  private: boolean;
  stargazers_count: number;
  subscribers_count?: number;
  forks_count: number;
  language: string | null;
  fork: boolean;
  archived: boolean;
  updated_at: string;
}

export interface RepositoryStats {
  stars: number;
  /** Undefined when GitHub's per-repository lookup failed. */
  watchers?: number;
  forks: number;
  language: string | null;
  isFork: boolean;
  isArchived: boolean;
  updatedAt: string;
}

export function normalizeRepositories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ownerPrefix = `${GITHUB_OWNER.toLowerCase()}/`;
  const repositories = new Map<string, string>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const repository = item.trim();
    const key = repository.toLowerCase();
    if (
      REPOSITORY_PATTERN.test(repository)
      && key.startsWith(ownerPrefix)
      && !repositories.has(key)
    ) {
      repositories.set(key, repository);
    }
    if (repositories.size === MAX_REPOSITORIES) break;
  }
  return Array.from(repositories.values());
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "portfolio-projects-page",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Watcher counts rarely change and need one request per repository, so they
// are cached far longer than the list: without GITHUB_TOKEN, GitHub allows
// only 60 unauthenticated requests per hour.
const SUBSCRIBERS_REVALIDATE_SECONDS = 6 * 60 * 60;

async function fetchGitHubJson(
  url: string,
  signal: AbortSignal,
  revalidate = REPOSITORY_STATS_REVALIDATE_SECONDS,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: githubHeaders(),
    next: { revalidate },
    signal,
  });
  if (!response.ok) throw new Error(`GitHub responded with ${response.status}`);
  return response.json();
}

/**
 * The repository list endpoint omits `subscribers_count` (its `watchers_count`
 * is the star count), so the real watcher count comes from each repository's
 * own endpoint. A failed lookup leaves the count unknown instead of failing
 * the whole list.
 */
async function subscribersCount(fullName: string, signal: AbortSignal): Promise<number | undefined> {
  try {
    const data = await fetchGitHubJson(
      `https://api.github.com/repos/${fullName}`,
      signal,
      SUBSCRIBERS_REVALIDATE_SECONDS,
    );
    const count = (data as { subscribers_count?: unknown } | null)?.subscribers_count;
    return typeof count === "number" && Number.isFinite(count) ? count : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The owner's public repositories. Watcher counts cost one request each, so
 * they are looked up only for `withWatchers` (the repositories being shown).
 */
export async function getPublicRepositories(
  withWatchers: readonly string[] = [],
): Promise<GitHubRepositoryResponse[]> {
  const wanted = new Set(withWatchers.map((name) => name.toLowerCase()));
  // One deadline covers the list and the per-repository lookups together.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const query = new URLSearchParams({
      per_page: "100",
      sort: "updated",
      type: "owner",
    });
    const data = await fetchGitHubJson(
      `https://api.github.com/users/${GITHUB_OWNER}/repos?${query}`,
      controller.signal,
    );
    if (!Array.isArray(data)) return [];
    const ownerPrefix = `${GITHUB_OWNER.toLowerCase()}/`;
    const publicRepositories = (data as GitHubRepositoryResponse[]).filter(
      (repository) => !repository.private
        && typeof repository.full_name === "string"
        && REPOSITORY_PATTERN.test(repository.full_name)
        && repository.full_name.toLowerCase().startsWith(ownerPrefix),
    );
    const counts = await Promise.all(publicRepositories.map(
      (repository) => wanted.has(repository.full_name.toLowerCase())
        ? subscribersCount(repository.full_name, controller.signal)
        : undefined,
    ));
    return publicRepositories.map((repository, index) => ({
      ...repository,
      subscribers_count: counts[index],
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function repositoryStatsFor(
  repositories: string[],
  publicRepositories: GitHubRepositoryResponse[],
): Record<string, RepositoryStats> {
  const byName = new Map(
    publicRepositories.map((repository) => [
      repository.full_name.toLowerCase(),
      repository,
    ]),
  );
  return Object.fromEntries(repositories.flatMap((repository) => {
    const data = byName.get(repository.toLowerCase());
    if (!data) return [];
    return [[repository, {
      stars: data.stargazers_count,
      watchers: data.subscribers_count,
      forks: data.forks_count,
      language: data.language,
      isFork: data.fork,
      isArchived: data.archived,
      updatedAt: data.updated_at,
    } satisfies RepositoryStats] as const];
  }));
}
