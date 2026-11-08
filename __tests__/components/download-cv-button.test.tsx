import { act, fireEvent, render, screen } from "@testing-library/react";
import DownloadCvButton, { isInAppBrowser } from "@/components/home/download-cv-button";
import { openUrl } from "@/lib/navigation/open-url";
import { reportClientEvent } from "@/lib/telemetry/report-client";

jest.mock("@/lib/telemetry/report-client", () => ({ reportClientEvent: jest.fn() }));
jest.mock("@/lib/navigation/open-url", () => ({ openUrl: jest.fn() }));

const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0";
const ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

describe("isInAppBrowser", () => {
  it("recognises in-app browsers but not normal browsers", () => {
    expect(isInAppBrowser(INSTAGRAM)).toBe(true);
    expect(isInAppBrowser(ANDROID_WEBVIEW)).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 [FBAN/FBIOS;FBAV/450.0]")).toBe(true);
    expect(isInAppBrowser(SAFARI)).toBe(false);
  });
});

describe("DownloadCvButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    (openUrl as jest.Mock).mockClear();
  });

  it("navigates to the CV in in-app browsers instead of a blob download", async () => {
    jest.spyOn(navigator, "userAgent", "get").mockReturnValue(INSTAGRAM);
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true, status: 200 }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    render(<DownloadCvButton href="/api/cv" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    // Only a HEAD check; the PDF itself is opened by navigation.
    expect(fetchMock).toHaveBeenCalledWith("/api/cv", { method: "HEAD", cache: "no-cache" });
    expect(openUrl).toHaveBeenCalledWith("/api/cv");
    expect(screen.getByRole("button")).toHaveTextContent("Downloaded ✓");
  });

  it("shows an error in in-app browsers instead of navigating to a failing CV", async () => {
    jest.spyOn(navigator, "userAgent", "get").mockReturnValue(INSTAGRAM);
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
    render(<DownloadCvButton href="/api/cv" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(openUrl).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveTextContent("Download failed — retry");
    // Announced, and kept until the next click.
    expect(screen.getByRole("status")).toHaveTextContent("Download failed — retry");
  });

  it("reports a failed download instead of only logging it", async () => {
    jest.spyOn(navigator, "userAgent", "get").mockReturnValue(SAFARI);
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ ok: false, status: 503 }));
    render(<DownloadCvButton href="/api/cv" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(reportClientEvent).toHaveBeenCalledWith("error", "cv download CV request failed with 503");
    expect(screen.getByRole("button")).toHaveTextContent("Download failed — retry");
  });
});
