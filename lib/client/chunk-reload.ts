const CHUNK_ERROR = /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i;
const RELOAD_KEY = "portfolio-chunk-reload";

/**
 * An old tab after a new deploy asks for app files that no longer exist.
 * Retrying cannot fix that, but one full reload loads the new version.
 * Returns true when a reload was started. Reloads at most once per tab
 * session, so a real outage shows the error message instead of looping.
 */
export function reloadOnceAfterChunkError(
  error: unknown,
  reload: () => void = () => window.location.reload(),
): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (!CHUNK_ERROR.test(text)) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    // Storage blocked: show the message instead of risking a reload loop.
    return false;
  }
  reload();
  return true;
}
