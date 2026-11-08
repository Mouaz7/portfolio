/**
 * @jest-environment node
 */

import { reportClientKey } from "@/lib/telemetry/report-identity.server";

const request = (address?: string) => new Request("https://portfolio.test/api/client-report", {
  headers: address ? { "x-vercel-id": "fra1::x", "x-vercel-forwarded-for": address } : { "x-vercel-id": "fra1::x" },
});

describe("reportClientKey", () => {
  const originalVercel = process.env.VERCEL;
  beforeAll(() => {
    process.env.VERCEL = "1";
  });
  afterAll(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it("hashes the address and never returns it", () => {
    const key = reportClientKey(request("203.0.113.7"));
    expect(key).not.toContain("203");
    expect(key).toBe(reportClientKey(request("203.0.113.7")));
    expect(key).not.toBe(reportClientKey(request("203.0.113.8")));
  });

  it("treats every address in one IPv6 /64 as one client", () => {
    expect(reportClientKey(request("2001:db8:1:2::1"))).toBe(reportClientKey(request("2001:0db8:0001:0002:ffff::9")));
    expect(reportClientKey(request("2001:db8:1:2::1"))).not.toBe(reportClientKey(request("2001:db8:1:3::1")));
  });

  it("keys an IPv4-mapped IPv6 address as its IPv4 client", () => {
    expect(reportClientKey(request("::ffff:203.0.113.7"))).toBe(reportClientKey(request("203.0.113.7")));
    expect(reportClientKey(request("::ffff:203.0.113.7"))).not.toBe(reportClientKey(request("::ffff:203.0.113.8")));
  });

  it("ignores Vercel headers when the app is not running on Vercel", () => {
    delete process.env.VERCEL;
    try {
      expect(reportClientKey(request("203.0.113.7"))).toBe(reportClientKey(request("203.0.113.8")));
    } finally {
      process.env.VERCEL = "1";
    }
  });

  it("uses one shared bucket when the address is unknown", () => {
    expect(reportClientKey(request())).toBe("unknown");
    expect(reportClientKey(request("not-an-ip"))).toBe("unknown");
  });
});
