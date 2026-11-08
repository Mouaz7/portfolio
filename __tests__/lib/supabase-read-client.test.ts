/**
 * @jest-environment node
 */

describe("Supabase read client", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SUPABASE_URL = "https://portfolio-test.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  });

  afterEach(() => {
    jest.dontMock("@supabase/supabase-js");
  });

  it("bounds every read with PostgREST's own 5 s timeout", async () => {
    const createClient = jest.fn(() => ({ from: jest.fn() }));
    jest.doMock("@supabase/supabase-js", () => ({ createClient }));
    const { supabase } = await import("@/lib/backend/supabaseClient");
    expect(createClient).not.toHaveBeenCalled();
    void supabase.from;
    const calls = createClient.mock.calls as unknown as Array<[string, string, Record<string, unknown>]>;
    expect(calls.at(-1)?.[2]).toMatchObject({
      auth: { persistSession: false },
      db: { timeout: 5000 },
    });
    // No custom fetch: a TimeoutError from AbortSignal.timeout would be retried.
    expect(calls.at(-1)?.[2]).not.toHaveProperty("global.fetch");
  });

  it("creates the client lazily, once, and keeps method calls bound to it", async () => {
    const from = jest.fn(function (this: unknown, table: string) {
      return { table, self: this };
    });
    const instance = { from, storage: { marker: true } };
    const createClient = jest.fn(() => instance);
    jest.doMock("@supabase/supabase-js", () => ({ createClient }));
    const { supabase } = await import("@/lib/backend/supabaseClient");

    expect(createClient).not.toHaveBeenCalled();
    const result = supabase.from("project") as unknown as { table: string; self: unknown };
    expect(result).toEqual({ table: "project", self: instance });
    expect(supabase.storage).toBe(instance.storage);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("does not throw at import when configuration is missing, only on use", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const createClient = jest.fn();
    jest.doMock("@supabase/supabase-js", () => ({ createClient }));

    const { supabase } = await import("@/lib/backend/supabaseClient");
    expect(() => supabase.from("project")).toThrow("Missing Supabase URL");

    process.env.SUPABASE_URL = "https://portfolio-test.supabase.co";
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => supabase.from("project")).toThrow("Missing Supabase read key");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("a stalled read fails once after the timeout instead of being retried", async () => {
    jest.dontMock("@supabase/supabase-js");
    const { createClient } = await import("@supabase/supabase-js");
    const fetchMock = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      })
    ));
    const client = createClient("https://portfolio-test.supabase.co", "key", {
      auth: { persistSession: false },
      db: { timeout: 50 },
      global: { fetch: fetchMock as unknown as typeof fetch },
    });

    const started = Date.now();
    const result = await client.from("project").select("id");
    expect(result.error).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
