/**
 * @jest-environment node
 */

import { isMobileRequest } from "@/lib/i18n/client-hints";
import { initialRepositoryStats } from "@/lib/projects/initial-stats.server";
import type { Project } from "@/lib/projects/types";
import { combineSkillsData } from "@/lib/skills/initial-data";

const project = (id: string, visibility: Project["visibility"] = "public"): Project => ({
  id,
  title: id,
  description: "",
  category: "Systems",
  github_url: `https://github.com/Mouaz7/${id}`,
  languages: [],
  visibility,
});

const repository = (name: string) => ({
  full_name: `Mouaz7/${name}`,
  private: false,
  stargazers_count: 3,
  forks_count: 1,
  language: "Java",
  fork: false,
  archived: false,
  updated_at: "2026-10-01T00:00:00Z",
});

describe("initialRepositoryStats", () => {
  it("returns stats for public projects only", async () => {
    const stats = await initialRepositoryStats([project("AegisDB"), project("secret", "private")], {
      loadRepositories: async () => [repository("AegisDB"), repository("secret")],
    });
    expect(Object.keys(stats ?? {})).toEqual(["Mouaz7/AegisDB"]);
    expect(stats?.["Mouaz7/AegisDB"].stars).toBe(3);
  });

  it("gives up after the budget so a slow GitHub never delays the page", async () => {
    const stats = await initialRepositoryStats([project("AegisDB")], {
      budgetMs: 10,
      loadRepositories: () => new Promise(() => {}),
    });
    expect(stats).toBeUndefined();
  });

  it("leaves the stats to the browser when GitHub returns nothing, and needs no request without public projects", async () => {
    const load = jest.fn(async () => []);
    expect(await initialRepositoryStats([project("AegisDB")], { loadRepositories: load })).toBeUndefined();
    expect(await initialRepositoryStats([project("secret", "private")], { loadRepositories: load })).toEqual({});
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("combineSkillsData", () => {
  const ok = <T,>(value: T): PromiseSettledResult<T> => ({ status: "fulfilled", value });
  const failed: PromiseSettledResult<never> = { status: "rejected", reason: new Error("db") };

  it("keeps skills and categories when only the projects failed", () => {
    expect(combineSkillsData(ok(["c"]), ok(["s"]), failed)).toEqual({ categories: ["c"], skills: ["s"], projects: [] });
  });

  it("renders nothing on the server without categories or skills", () => {
    expect(combineSkillsData(failed, ok(["s"]), ok(["p"]))).toBeUndefined();
    expect(combineSkillsData(ok(["c"]), failed, ok(["p"]))).toBeUndefined();
  });
});

describe("isMobileRequest", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it("uses the client hint first, then the user agent", () => {
    expect(isMobileRequest(headers({ "sec-ch-ua-mobile": "?1" }))).toBe(true);
    expect(isMobileRequest(headers({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)" }))).toBe(true);
    expect(isMobileRequest(headers({ "user-agent": "Mozilla/5.0 (Linux; Android 14; SM-S918B) Mobile Safari/537.36" }))).toBe(true);
    expect(isMobileRequest(headers({ "sec-ch-ua-mobile": "?0", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }))).toBe(false);
    expect(isMobileRequest(headers({}))).toBe(false);
  });
});
