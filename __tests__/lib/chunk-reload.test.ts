import { reloadOnceAfterChunkError } from "@/lib/client/chunk-reload";

describe("reloadOnceAfterChunkError", () => {
  const reload = jest.fn();

  beforeEach(() => {
    reload.mockClear();
    sessionStorage.clear();
  });

  it("reloads once for a missing app file after a new deploy", () => {
    const error = Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" });
    expect(reloadOnceAfterChunkError(error, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // A second failure in the same tab shows the error message instead of looping.
    expect(reloadOnceAfterChunkError(error, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores other errors and non-Error values", () => {
    expect(reloadOnceAfterChunkError(new Error("boom"), reload)).toBe(false);
    expect(reloadOnceAfterChunkError(null, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
