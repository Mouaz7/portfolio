/**
 * @jest-environment node
 */

type Limiter = typeof import("@/lib/telemetry/report-rate-limit.server");

function freshLimiter(): Limiter {
  let limiter!: Limiter;
  jest.isolateModules(() => {
    limiter = jest.requireActual("@/lib/telemetry/report-rate-limit.server");
  });
  return limiter;
}

describe("takeReportSlot", () => {
  it("allows 10 reports per client per 10 minutes", () => {
    const { takeReportSlot } = freshLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 10; i += 1) expect(takeReportSlot("a", now + i)).toBe(true);
    expect(takeReportSlot("a", now + 10)).toBe(false);
    expect(takeReportSlot("b", now + 10)).toBe(true);
    expect(takeReportSlot("a", now + 10 * 60_000)).toBe(true);
  });

  it("caps all clients together at 30 per minute", () => {
    const { takeReportSlot } = freshLimiter();
    const now = 5_000_000;
    for (let i = 0; i < 30; i += 1) expect(takeReportSlot(`client-${i}`, now)).toBe(true);
    expect(takeReportSlot("another", now)).toBe(false);
    expect(takeReportSlot("another", now + 60_000)).toBe(true);
  });
});
