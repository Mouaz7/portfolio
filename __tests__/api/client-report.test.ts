/**
 * @jest-environment node
 */

import { POST } from "@/app/api/client-report/route";
import { takeReportSlot } from "@/lib/telemetry/report-rate-limit.server";

jest.mock("@/lib/telemetry/report-rate-limit.server", () => ({
  takeReportSlot: jest.fn(() => true),
}));

const takeSlot = takeReportSlot as jest.Mock;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Mobile/15E148 Safari/604.1";

function report(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://portfolio.test/api/client-report", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      "user-agent": IPHONE,
      "x-real-ip": "203.0.113.7",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("/api/client-report", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    takeSlot.mockReset().mockReturnValue(true);
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("logs a cleaned report with coarse browser data and nothing identifying", async () => {
    const response = await POST(report({
      kind: "background",
      page: "/sv/projects?x=1",
      message: "worker-failed mobile for me@example.com",
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    const record = JSON.parse(line);
    expect(record).toMatchObject({
      event: "client.report",
      kind: "background",
      browser: "safari-15",
      os: "ios-15",
      page: "/sv/projects",
      message: "worker-failed mobile for [email]",
    });
    expect(line).not.toMatch(/203\.0\.113\.7|example\.com|Mozilla|x=1/);
    // The limiter gets a keyed hash, never the address itself.
    expect(takeSlot.mock.calls[0][0]).not.toContain("203.0.113.7");
  });

  it("rejects reports from other sites", async () => {
    const response = await POST(report({ kind: "error", page: "/" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects oversized, malformed and off-schema bodies", async () => {
    expect((await POST(report({ kind: "error", page: "/", message: "x".repeat(3_000) }))).status).toBe(413);
    expect((await POST(report("{not json"))).status).toBe(400);
    expect((await POST(report({ kind: "error", page: "/", name: "Jane" }))).status).toBe(400);
    expect((await POST(report({ kind: "error" }, { "content-type": "text/html" }))).status).toBe(415);
    expect(warn).not.toHaveBeenCalled();
  });

  it("drops reports quietly over the rate limit", async () => {
    takeSlot.mockReturnValue(false);
    const response = await POST(report({ kind: "error", page: "/" }));
    expect(response.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});
