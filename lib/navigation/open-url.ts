/** Full-page navigation to `href` (kept separate so tests can observe it). */
export function openUrl(href: string) {
  window.location.assign(href);
}
