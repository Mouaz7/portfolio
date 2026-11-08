/**
 * @jest-environment node
 */

import { unstable_cache } from "next/cache";
import { CACHE_VERSION, cachedLoader } from "@/lib/cached-loader.server";

jest.mock("next/cache", () => ({ unstable_cache: jest.fn((load: () => unknown) => load) }));

describe("cachedLoader", () => {
  it("keys every cache entry by the cache version, with the area's tag and window", async () => {
    const load = jest.fn(async () => ["data"]);
    const cached = cachedLoader(load, ["projects-v9", "sv"], "projects");
    expect(unstable_cache).toHaveBeenCalledWith(load, [CACHE_VERSION, "projects-v9", "sv"], {
      revalidate: 1800,
      tags: ["projects"],
    });
    await expect(cached()).resolves.toEqual(["data"]);
  });
});
