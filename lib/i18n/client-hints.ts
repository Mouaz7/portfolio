/**
 * Whether a request comes from a phone, from the Sec-CH-UA-Mobile client hint
 * (Chromium) or the User-Agent (Safari, Firefox). Lets the server render the
 * mobile layout first instead of switching after hydration.
 */
export function isMobileRequest(headers: Pick<Headers, "get">): boolean {
  if (headers.get("sec-ch-ua-mobile") === "?1") return true;
  return /Android|iPhone|iPod|Mobile/i.test(headers.get("user-agent") ?? "");
}
