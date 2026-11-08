/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

import {
  getPublicRepositories,
  repositoryStatsFor,
} from "@/lib/projects/repository-stats.server";

const LIST_URL_PREFIX = "https://api.github.com/users/Mouaz7/repos?";

function listEntry(fullName: string, overrides: Record<string, unknown> = {}) {
  return {
    full_name: fullName,
    private: false,
    stargazers_count: 7,
    // The list endpoint mirrors the star count here; it is not the watcher count.
    watchers_count: 7,
    forks_count: 2,
    language: "TypeScript",
    fork: false,
    archived: false,
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("repository stats", () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    jest.useRealTimers();
  });

  it("reads the real watcher count from each public repository", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith(LIST_URL_PREFIX)) {
        return jsonResponse([
          listEntry("Mouaz7/alpha"),
          listEntry("Mouaz7/beta"),
          listEntry("Mouaz7/secret", { private: true }),
          listEntry("someone-else/alpha"),
        ]);
      }
      if (input === "https://api.github.com/repos/Mouaz7/alpha") {
        return jsonResponse({ subscribers_count: 3 });
      }
      if (input === "https://api.github.com/repos/Mouaz7/beta") {
        return jsonResponse({ subscribers_count: 1 });
      }
      throw new Error(`Unexpected request ${input}`);
    });

    const repositories = await getPublicRepositories(["mouaz7/alpha", "Mouaz7/beta"]);
    const stats = repositoryStatsFor(["Mouaz7/alpha", "Mouaz7/beta"], repositories);

    expect(stats["Mouaz7/alpha"]).toEqual({
      stars: 7,
      watchers: 3,
      forks: 2,
      language: "TypeScript",
      isFork: false,
      isArchived: false,
      updatedAt: "2026-10-01T00:00:00Z",
    });
    expect(stats["Mouaz7/beta"].watchers).toBe(1);
    // One list request plus one lookup per requested repository owned by the user.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchMock.mock.calls as Array<[string, RequestInit & { next?: unknown }]>) {
      // The list refreshes every 30 minutes, the per-repository watcher counts every 6 hours.
      expect(init.next).toEqual({ revalidate: url.includes("/users/") ? 1800 : 21600 });
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("looks up watchers only for the requested repositories", async () => {
    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith(LIST_URL_PREFIX)) {
        return jsonResponse([listEntry("Mouaz7/alpha"), listEntry("Mouaz7/beta")]);
      }
      if (input === "https://api.github.com/repos/Mouaz7/alpha") {
        return jsonResponse({ subscribers_count: 4 });
      }
      throw new Error(`Unexpected request ${input}`);
    });

    const stats = repositoryStatsFor(["Mouaz7/alpha"], await getPublicRepositories(["Mouaz7/alpha"]));

    expect(stats["Mouaz7/alpha"].watchers).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("leaves watchers unknown when a repository lookup fails", async () => {
    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith(LIST_URL_PREFIX)) {
        return jsonResponse([listEntry("Mouaz7/alpha"), listEntry("Mouaz7/beta")]);
      }
      if (input.endsWith("/alpha")) return jsonResponse({ message: "rate limited" }, 403);
      throw new Error("network down");
    });

    const stats = repositoryStatsFor(
      ["Mouaz7/alpha", "Mouaz7/beta"],
      await getPublicRepositories(["Mouaz7/alpha", "Mouaz7/beta"]),
    );

    expect(stats["Mouaz7/alpha"]).toMatchObject({ stars: 7, watchers: undefined });
    expect(stats["Mouaz7/beta"]).toMatchObject({ stars: 7, watchers: undefined });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("returns no repositories when the list request fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "rate limited" }, 403));

    await expect(getPublicRepositories()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the list when lookups outlast the shared deadline", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((input: string, init: RequestInit) => {
      if (input.startsWith(LIST_URL_PREFIX)) {
        return Promise.resolve(jsonResponse([listEntry("Mouaz7/alpha")]));
      }
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });

    const pending = getPublicRepositories(["Mouaz7/alpha"]);
    await jest.advanceTimersByTimeAsync(5_000);
    const repositories = await pending;

    expect(repositoryStatsFor(["Mouaz7/alpha"], repositories)["Mouaz7/alpha"])
      .toMatchObject({ stars: 7, watchers: undefined });
  });
});
