type Sender = typeof import("@/lib/telemetry/report-client");

function freshSender(): Sender {
  let sender!: Sender;
  jest.isolateModules(() => {
    sender = jest.requireActual("@/lib/telemetry/report-client");
  });
  return sender;
}

describe("reportClientEvent", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(() => Promise.resolve({ status: 204 }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    if (typeof TextEncoder === "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (globalThis as unknown as { TextEncoder: unknown }).TextEncoder = require("node:util").TextEncoder;
    }
    window.history.replaceState(null, "", "/sv/skills?debug=1#x");
  });

  it("sends a cleaned report for the current page path, without cookies", () => {
    const { reportClientEvent } = freshSender();
    expect(reportClientEvent("error", "TypeError for a@b.se")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/client-report");
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
    expect(JSON.parse(init.body)).toEqual({ kind: "error", page: "/sv/skills", message: "TypeError for [email]" });
  });

  it("sends at most three automatic reports per page load and no duplicates", () => {
    const { reportClientEvent } = freshSender();
    expect(reportClientEvent("error", "one")).toBe(true);
    expect(reportClientEvent("error", "one")).toBe(false);
    expect(reportClientEvent("error", "two")).toBe(true);
    expect(reportClientEvent("background", "three")).toBe(true);
    expect(reportClientEvent("background", "four")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never throws when fetch fails", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    const { reportClientEvent } = freshSender();
    expect(reportClientEvent("error", "x")).toBe(true);
    await Promise.resolve();
  });
});

describe("reportClientEvent while leaving the page", () => {
  it("sends no automatic reports after pagehide, and again after pageshow", () => {
    const fetchMock = jest.fn(() => Promise.resolve({ status: 204 }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    const { reportClientEvent } = freshSender();
    window.dispatchEvent(new Event("pagehide"));
    expect(reportClientEvent("background", "worker-failed desktop")).toBe(false);
    window.dispatchEvent(new Event("pageshow"));
    expect(reportClientEvent("background", "worker-failed desktop")).toBe(true);
  });
});
