// Reduces a User-Agent header to browser family + major version and operating
// system family (+ major version on mobile), e.g. "samsung-23" / "android-14".
// Only these coarse values are logged, never the header itself.

const BROWSERS: ReadonlyArray<readonly [string, RegExp]> = [
  ["samsung", /SamsungBrowser\/(\d{1,3})/],
  ["edge", /Edg(?:e|A|iOS)?\/(\d{1,3})/],
  ["opera", /(?:OPR|OPiOS)\/(\d{1,3})/],
  ["firefox", /(?:Firefox|FxiOS)\/(\d{1,3})/],
  ["chrome", /(?:Chrome|CriOS)\/(\d{1,3})/],
  ["safari", /Version\/(\d{1,3})[\d.]* (?:Mobile\/\S+ )?Safari\//],
];

export function describeUserAgent(userAgent: string | null | undefined): { browser: string; os: string } {
  const ua = (userAgent ?? "").slice(0, 512);
  let browser = "other";
  for (const [name, pattern] of BROWSERS) {
    const match = pattern.exec(ua);
    if (match) {
      browser = `${name}-${match[1]}`;
      break;
    }
  }

  let os = "other";
  const ios = /(?:iPhone|iPad|iPod)[^)]*? OS (\d{1,2})_/.exec(ua);
  const android = /Android (\d{1,2})/.exec(ua);
  if (ios) {
    os = `ios-${ios[1]}`;
    // In-app browsers (WKWebView) have no Version/ token.
    if (browser === "other" && /AppleWebKit\//.test(ua)) browser = "ios-webview";
  } else if (android) os = `android-${android[1]}`;
  else if (/Windows NT/.test(ua)) os = "windows";
  else if (/CrOS/.test(ua)) os = "chromeos";
  else if (/Mac OS X/.test(ua)) os = "macos";
  else if (/Linux/.test(ua)) os = "linux";

  return { browser, os };
}
