import { filterAndSortProjects, groupProjectsByCategory } from "@/lib/projects/filter";
import type { RepositoryStats } from "@/lib/projects/repository-stats.server";
import type { Project } from "@/lib/projects/types";

function project(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    title: id,
    description: `${id} description`,
    category: "Full-Stack",
    github_url: `https://github.com/owner/${id}`,
    languages: ["TypeScript"],
    visibility: "public",
    ...overrides,
  };
}

const stats = (overrides: Partial<RepositoryStats>): RepositoryStats => ({
  stars: 0,
  forks: 0,
  isFork: false,
  isArchived: false,
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
} as RepositoryStats);

const base = { search: "", language: "all", type: "all", sort: "default", stats: {}, collation: "en-US" } as const;

describe("project list rules", () => {
  const projects = [
    project("beta", { languages: ["Python"], visibility: "private" }),
    project("alpha", { description: "a Docker build" }),
    project("gamma", { category: "Systems", languages: ["C"] }),
  ];
  const repoStats = {
    "owner/alpha": stats({ stars: 5, forks: 1, updatedAt: "2026-03-01T00:00:00Z" }),
    "owner/beta": stats({ stars: 9, isFork: true, updatedAt: "2026-01-01T00:00:00Z" }),
    "owner/gamma": stats({ isArchived: true, forks: 7, updatedAt: "2026-05-01T00:00:00Z" }),
  };

  it("groups projects by category", () => {
    const groups = groupProjectsByCategory(projects);
    expect(Object.keys(groups)).toEqual(["Full-Stack", "Systems"]);
    expect(groups["Full-Stack"].map((p) => p.id)).toEqual(["beta", "alpha"]);
  });

  it("searches titles, descriptions and languages, and filters by language", () => {
    expect(filterAndSortProjects(projects, { ...base, search: " docker " }).map((p) => p.id)).toEqual(["alpha"]);
    expect(filterAndSortProjects(projects, { ...base, search: "python" }).map((p) => p.id)).toEqual(["beta"]);
    expect(filterAndSortProjects(projects, { ...base, language: "c" }).map((p) => p.id)).toEqual(["gamma"]);
  });

  it("filters by repository type using the GitHub stats", () => {
    const ids = (type: typeof base.type | "public" | "source" | "fork" | "archived") => (
      filterAndSortProjects(projects, { ...base, type, stats: repoStats }).map((p) => p.id)
    );
    expect(ids("public")).toEqual(["alpha", "gamma"]);
    expect(ids("source")).toEqual(["alpha"]);
    expect(ids("fork")).toEqual(["beta"]);
    expect(ids("archived")).toEqual(["gamma"]);
  });

  it("sorts by name, stars, forks and last update", () => {
    const ids = (sort: "default" | "name" | "stars" | "forks" | "updated") => (
      filterAndSortProjects(projects, { ...base, sort, stats: repoStats }).map((p) => p.id)
    );
    expect(ids("default")).toEqual(["beta", "alpha", "gamma"]);
    expect(ids("name")).toEqual(["alpha", "beta", "gamma"]);
    expect(ids("stars")).toEqual(["beta", "alpha", "gamma"]);
    expect(ids("forks")).toEqual(["gamma", "alpha", "beta"]);
    expect(ids("updated")).toEqual(["gamma", "alpha", "beta"]);
  });
});
