// Single source of truth for data-cache tags and revalidate windows.
//
// Route segment config (`export const revalidate = N`) must stay a numeric
// literal because Next.js reads it by static analysis; __tests__/lib/cache.test.ts
// keeps those literals in sync with REVALIDATE_SECONDS.
export const CACHE_TAGS = {
  projects: "projects",
  skills: "skills",
  journey: "journey",
  contact: "contact",
  homeContent: "home-content",
} as const;

export const REVALIDATE_SECONDS = {
  projects: 1800,
  skills: 3600,
  journey: 7200,
  contact: 3600,
  homeContent: 1800,
} as const;

export function sharedCacheHeaders(revalidateSeconds: number) {
  return {
    "Cache-Control": `public, max-age=${revalidateSeconds}, s-maxage=${revalidateSeconds}, stale-while-revalidate=${revalidateSeconds}`,
  };
}
