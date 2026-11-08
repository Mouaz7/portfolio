import { render } from "@testing-library/react";
import ErrorReporter from "@/components/ui/ErrorReporter";
import { reportClientEvent } from "@/lib/telemetry/report-client";

jest.mock("@/lib/telemetry/report-client", () => ({ reportClientEvent: jest.fn() }));

const report = reportClientEvent as jest.Mock;

function rejection(reason: unknown) {
  const event = new Event("unhandledrejection") as Event & { reason: unknown };
  event.reason = reason;
  return event;
}

describe("ErrorReporter", () => {
  beforeEach(() => report.mockClear());

  it("reports uncaught errors from the site's own scripts only", () => {
    const { unmount } = render(<ErrorReporter />);
    window.dispatchEvent(new ErrorEvent("error", {
      message: "x is not a function",
      filename: `${window.location.origin}/_next/static/chunks/app.js`,
      error: new TypeError("x is not a function"),
    }));
    window.dispatchEvent(new ErrorEvent("error", {
      message: "extension broke",
      filename: "chrome-extension://abc/content.js",
    }));
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("error", "TypeError: x is not a function");
    unmount();
    window.dispatchEvent(new ErrorEvent("error", { message: "after", filename: `${window.location.origin}/a.js` }));
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("reports the site's own unhandled rejections except cancelled requests", () => {
    render(<ErrorReporter />);
    const own = (error: Error) => {
      error.stack = `${error.name}: ${error.message}\n    at f (${window.location.origin}/_next/static/chunks/app.js:1:2)`;
      return error;
    };
    const abort = own(new Error("aborted"));
    abort.name = "AbortError";
    window.dispatchEvent(rejection(abort));
    window.dispatchEvent(rejection(own(new RangeError("bad"))));
    const foreign = new TypeError("wallet");
    foreign.stack = "TypeError: wallet\n    at x (chrome-extension://abc/inpage.js:1:1)";
    window.dispatchEvent(rejection(foreign));
    window.dispatchEvent(rejection("string reason"));
    window.dispatchEvent(rejection({ code: 1 }));
    expect(report.mock.calls).toEqual([["unhandled-rejection", "RangeError: bad"]]);
  });
});
