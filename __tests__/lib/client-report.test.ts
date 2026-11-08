/**
 * @jest-environment node
 */

import {
  parseClientReport,
  sanitizeReportPage,
  sanitizeReportText,
} from "@/lib/telemetry/client-report";
import { describeUserAgent } from "@/lib/telemetry/user-agent";

describe("sanitizeReportText", () => {
  it("removes e-mail addresses, links, tokens and long numbers", () => {
    const text = sanitizeReportText(
      "Failed for jane.doe@example.com at https://evil.test/a?b=c, www.x.se, blob:https://site/1 "
      + "Bearer abc.def eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl 0123456789 id=AbCdEfGhIjKlMnOpQrStUvWxYz012345",
    );
    expect(text).not.toMatch(/jane|example\.com|evil|x\.se|abc\.def|eyJ|0123456789|AbCdEf/);
    expect(text).toContain("[email]");
    expect(text).toContain("[url]");
    expect(text).toContain("[token]");
    expect(text).toContain("[n]");
  });

  it("removes phone numbers, addresses, user paths, queries and hidden characters", () => {
    const cases: Array<[string, RegExp]> = [
      ["call +46 70 123 45 67 or 070-123 45 67", /123|070/],
      ["from 192.168.1.10 and 2001:db8::1", /192\.168|2001:db8/],
      ["at C:\\Users\\JohnSmith\\AppData\\x.js and /home/john/x", /JohnSmith|john/],
      ["fetch /contact?email=jo%40x.se&name=Mouaz", /jo|Mouaz|x\.se/],
      ["localhost:3000/x?a=b", /localhost|a=b/],
      ["jöhn@exämple.se wrote", /jöhn|exämple/],
      ["رقم ١٢٣٤٥٦٧٨٩٠", /١٢٣/],
      ["a\u202Eb\u200Bc", /\u202E|\u200B/],
    ];
    for (const [input, leaked] of cases) expect(sanitizeReportText(input)).not.toMatch(leaked);
  });

  it("drops control characters, collapses whitespace and caps the length", () => {
    expect(sanitizeReportText("a\u0000\n\tb   c")).toBe("a b c");
    expect(sanitizeReportText("x".repeat(500)).length).toBeLessThanOrEqual(160);
    expect(sanitizeReportText("TypeError: x is not a function")).toBe("TypeError: x is not a function");
    expect(sanitizeReportText(42)).toBe("");
  });
});

describe("sanitizeReportPage", () => {
  it("keeps only the path of a page on this site", () => {
    expect(sanitizeReportPage("/sv/projects?ref=mail#top")).toBe("/sv/projects");
    expect(sanitizeReportPage("https://evil.test/")).toBe("/unknown");
    expect(sanitizeReportPage("/name@example.com")).toBe("/unknown");
    expect(sanitizeReportPage(undefined)).toBe("/unknown");
  });
});

describe("parseClientReport", () => {
  it("accepts a valid report and cleans it", () => {
    expect(parseClientReport({ kind: "error", page: "/ar", message: "TypeError: boom at https://x.test/a.js" }))
      .toEqual({ kind: "error", page: "/ar", message: "TypeError: boom at [url]" });
  });

  it("rejects unknown kinds, unknown fields and wrong types", () => {
    expect(parseClientReport({ kind: "spam", page: "/" })).toBeNull();
    expect(parseClientReport({ kind: "error", page: "/", email: "a@b.se" })).toBeNull();
    expect(parseClientReport({ kind: "error", page: "/", message: { nested: true } })).toBeNull();
  });

});

describe("describeUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
      { browser: "samsung-23", os: "android-14" },
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Mobile/15E148 Safari/604.1",
      { browser: "safari-15", os: "ios-15" },
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0",
      { browser: "ios-webview", os: "ios-17" },
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
      { browser: "chrome-124", os: "ios-17" },
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      { browser: "edge-130", os: "windows" },
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0",
      { browser: "firefox-131", os: "macos" },
    ],
    [
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      { browser: "chrome-129", os: "chromeos" },
    ],
    [null, { browser: "other", os: "other" }],
  ])("%s", (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toEqual(expected);
  });
});
