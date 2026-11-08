import "server-only";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS, REVALIDATE_SECONDS } from "@/lib/cache";

/**
 * Part of every data-cache key. Vercel keeps the data cache across
 * deployments; changing this makes a new deployment start from fresh data
 * instead of entries cached by an older version of the code.
 */
export const CACHE_VERSION = "2026-11-07";

type CacheArea = keyof typeof CACHE_TAGS & keyof typeof REVALIDATE_SECONDS;

/** unstable_cache with the area's tag and revalidate window and the cache version. */
export function cachedLoader<T>(
  load: () => Promise<T>,
  keyParts: string[],
  area: CacheArea,
): () => Promise<T> {
  return unstable_cache(load, [CACHE_VERSION, ...keyParts], {
    revalidate: REVALIDATE_SECONDS[area],
    tags: [CACHE_TAGS[area]],
  });
}
