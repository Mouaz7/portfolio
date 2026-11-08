/**
 * @jest-environment node
 */

import { getHomeContent } from "@/lib/home/content.server";
import { fallbackHomeContent } from "@/lib/home/types";
import { supabase } from "@/lib/backend/supabaseClient";

const mockCachedLoads: Promise<unknown>[] = [];

jest.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => () => {
    const load = fn();
    mockCachedLoads.push(load);
    return load;
  },
}));

jest.mock("@/lib/backend/supabaseClient", () => ({
  supabase: { from: jest.fn() },
}));

type QueryResult = { data: unknown; error: unknown };

function chain(result: QueryResult) {
  const query: Record<string, unknown> = {
    then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ["select", "eq", "order", "in", "maybeSingle"]) {
    query[method] = jest.fn(() => query);
  }
  return query;
}

function mockTables(results: Partial<Record<string, QueryResult>>) {
  (supabase.from as jest.Mock).mockImplementation((table: string) =>
    chain(results[table] ?? { data: [], error: null }));
}

describe("getHomeContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCachedLoads.length = 0;
  });

  it("serves the fallback without letting the cache store it when a query fails", async () => {
    mockTables({ home_role: { data: null, error: { message: "timeout" } } });

    await expect(getHomeContent("en")).resolves.toEqual(fallbackHomeContent("en"));
    expect(mockCachedLoads).toHaveLength(1);
    await expect(mockCachedLoads[0]).rejects.toEqual({ message: "timeout" });
  });

  it("does not cache untranslated content when the translation query fails", async () => {
    mockTables({ content_translation: { data: null, error: { code: "57014" } } });

    await expect(getHomeContent("sv")).resolves.toEqual(fallbackHomeContent("sv"));
    await expect(mockCachedLoads[0]).rejects.toEqual({ code: "57014" });
  });

  it("still loads content while the translation table is missing", async () => {
    mockTables({ content_translation: { data: null, error: { code: "PGRST205" } } });

    await expect(getHomeContent("sv")).resolves.toEqual(fallbackHomeContent("sv"));
    await expect(mockCachedLoads[0]).resolves.toEqual(fallbackHomeContent("sv"));
    expect(supabase.from).toHaveBeenCalledWith("content_translation");
  });
});
