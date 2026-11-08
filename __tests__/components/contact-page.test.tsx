import { act, fireEvent, render, screen, waitFor } from "@/tests/test-utils";
import ContactPage from "@/app/contact/contact-page";
import en from "@/lib/i18n/dictionaries/en";
import { FALLBACK_CONTACT_LINKS, type ContactSocialLink } from "@/lib/contact/social-links";

jest.mock("@/components/navigation/Header", () => ({
  __esModule: true,
  default: () => <header data-testid="header" />,
}));

jest.mock("@/components/navigation/Footer", () => ({
  __esModule: true,
  default: () => <footer data-testid="footer" />,
}));

jest.mock("@/components/contact/photo-social-container", () => ({
  __esModule: true,
  default: () => <section data-testid="portrait" />,
}));

describe("contact page form", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = jest.fn() as typeof fetch;
  });

  it("validates required fields without sending a request", async () => {
    const fetchMock = global.fetch as jest.Mock;
    const { container } = render(<ContactPage initialLinks={[]} />);
    const form = container.querySelector<HTMLFormElement>(
      'form[aria-label="Contact form"]',
    );

    fireEvent.submit(form!);

    expect(await screen.findByText("Please fill in Name, Email, and Message.")).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector("#contact-mobile-name")).toHaveFocus();
    });
    expect(container.querySelector("#contact-mobile-name")).toHaveAttribute("aria-invalid", "true");
    expect(container.querySelector("#contact-mobile-name")).toHaveAttribute(
      "aria-describedby",
      "contact-mobile-error",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("moves validation focus through email and message errors", async () => {
    const { container } = render(<ContactPage initialLinks={[]} />);
    const form = container.querySelector<HTMLFormElement>('form[aria-label="Contact form"]')!;
    const name = container.querySelector<HTMLInputElement>("#contact-mobile-name")!;
    const email = container.querySelector<HTMLInputElement>("#contact-mobile-email")!;
    const message = container.querySelector<HTMLTextAreaElement>("#contact-mobile-message")!;

    fireEvent.change(name, { target: { value: "Mouaz Test" } });
    fireEvent.submit(form);
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(email, { target: { value: "invalid-email" } });
    fireEvent.change(message, { target: { value: "Validation message" } });
    fireEvent.submit(form);
    await waitFor(() => expect(email).toHaveFocus());
    expect(await screen.findByText("Please enter a valid email address.")).toBeInTheDocument();

    fireEvent.change(email, { target: { value: "test@example.com" } });
    fireEvent.change(message, { target: { value: "" } });
    fireEvent.submit(form);
    await waitFor(() => expect(message).toHaveFocus());
    expect(message).toHaveAttribute("aria-invalid", "true");
  });

  it("presents the form as a GitHub repository workflow with a working preview", () => {
    const { container } = render(<ContactPage initialLinks={[]} />);

    expect(container.querySelector(".contact-repository-owner")).toHaveTextContent("Mouaz7");
    expect(container.querySelector(".contact-repository-title strong")).toHaveTextContent(
      "contact-form",
    );
    expect(screen.getByText("Pull requests")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contact delivery pipeline")).not.toBeInTheDocument();
    expect(screen.getAllByText("Commit to main").length).toBeGreaterThan(0);

    fireEvent.change(container.querySelector("#contact-mobile-message")!, {
      target: { value: "Preview this commit message." },
    });
    fireEvent.click(container.querySelector("#contact-mobile-preview-tab")!);

    expect(screen.getByText("Preview this commit message.")).toBeInTheDocument();
    expect(container.querySelector("#contact-mobile-preview-tab")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("prepares and sends a valid JSON submission", async () => {
    const submissionId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, submissionId, uploads: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
    const { container, unmount } = render(<ContactPage initialLinks={[]} />);

    fireEvent.change(container.querySelector("#contact-mobile-name")!, {
      target: { value: "Mouaz Test" },
    });
    fireEvent.change(container.querySelector("#contact-mobile-email")!, {
      target: { value: "test@example.com" },
    });
    fireEvent.change(container.querySelector("#contact-mobile-message")!, {
      target: { value: "A secure contact test." },
    });
    fireEvent.submit(container.querySelector('form[aria-label="Contact form"]')!);

    await waitFor(() => {
      expect(screen.getByText(en.contact.sentThanks, { selector: '[role="status"]' })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/contact/prepare",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/contact/send",
      expect.objectContaining({
        body: JSON.stringify({ submissionId }),
        method: "POST",
      }),
    );
    unmount();
  });
});

type MockResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

const jsonResponse = (status: number, body: unknown): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const OWNER_EMAIL_LINKS: ContactSocialLink[] = [
  { id: 3, title: "Email", href: "mailto:owner@example.com", svgPath: "", viewBox: "0 0 24 24" },
];

function fillAndSubmit(container: HTMLElement) {
  fireEvent.change(container.querySelector("#contact-mobile-name")!, {
    target: { value: "Mouaz Test" },
  });
  fireEvent.change(container.querySelector("#contact-mobile-email")!, {
    target: { value: "test@example.com" },
  });
  fireEvent.change(container.querySelector("#contact-mobile-message")!, {
    target: { value: "A secure contact test." },
  });
  fireEvent.submit(container.querySelector('form[aria-label="Contact form"]')!);
}

describe("contact send failures and success", () => {
  const submissionId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  function routeFetch(routes: Record<string, () => MockResponse | Promise<MockResponse>>) {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const handler = routes[url];
      if (!handler) throw new Error(`Unexpected fetch ${url}`);
      return handler();
    }) as unknown as typeof fetch;
  }

  it.each([
    ["rate_limited", 429, en.contact.sendRateLimited],
    ["captcha_invalid", 400, en.contact.sendCaptchaInvalid],
    ["busy", 503, en.contact.sendBusy],
    ["security_unavailable", 503, en.contact.sendBusy],
    ["attachments_unavailable", 503, en.contact.sendAttachmentsUnavailable],
    ["attachment_invalid", 400, en.contact.sendAttachmentRejected],
    // Still required after the client's Turnstile retry.
    ["captcha_required", 403, en.contact.sendCaptchaFailed],
  ])("explains a prepare failure with code %s", async (code, status, message) => {
    routeFetch({ "/api/contact/prepare": () => jsonResponse(status, { ok: false, code }) });
    const { container } = render(<ContactPage initialLinks={OWNER_EMAIL_LINKS} />);

    fillAndSubmit(container);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent("You can also email me at owner@example.com.");
    expect(screen.getByRole("link", { name: "owner@example.com" })).toHaveAttribute(
      "href",
      "mailto:owner@example.com",
    );
  });

  it("maps send-step failures and falls back to the generic message", async () => {
    routeFetch({
      "/api/contact/prepare": () => jsonResponse(200, { ok: true, submissionId, uploads: [] }),
      "/api/contact/send": () => jsonResponse(503, { ok: false, code: "attachment_scan_failed" }),
    });
    const first = render(<ContactPage initialLinks={OWNER_EMAIL_LINKS} />);
    fillAndSubmit(first.container);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.contact.sendAttachmentsUnavailable);
    first.unmount();

    routeFetch({
      "/api/contact/prepare": () => jsonResponse(200, { ok: true, submissionId, uploads: [] }),
      "/api/contact/send": () => jsonResponse(404, { ok: false, error: "Submission not found." }),
    });
    const second = render(<ContactPage initialLinks={OWNER_EMAIL_LINKS} />);
    fillAndSubmit(second.container);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.contact.sendFailed);
  });

  it("explains network and security-check failures", async () => {
    routeFetch({
      "/api/contact/prepare": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const first = render(<ContactPage initialLinks={[]} />);
    fillAndSubmit(first.container);
    const networkAlert = await screen.findByRole("alert");
    expect(networkAlert).toHaveTextContent(en.contact.sendNetwork);
    // No e-mail link was loaded, so no address is offered.
    expect(networkAlert).not.toHaveTextContent("You can also email me");
    first.unmount();

    // The challenge is required but Turnstile is not configured in tests, so
    // the browser-side check rejects.
    routeFetch({
      "/api/contact/prepare": () => ({
        ...jsonResponse(428, { ok: false, code: "captcha_required" }),
        clone() {
          return jsonResponse(428, { ok: false, code: "captcha_required" });
        },
      } as MockResponse),
    });
    const second = render(<ContactPage initialLinks={[]} />);
    fillAndSubmit(second.container);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.contact.sendCaptchaFailed);
  });

  it("offers the fallback address when the social links could not be loaded", async () => {
    routeFetch({
      "/api/contact": () => jsonResponse(500, { error: "db" }),
      "/api/contact/prepare": () => jsonResponse(429, { ok: false, code: "rate_limited" }),
    });
    const { container } = render(<ContactPage />);

    // The phone layout shows the static links straight away.
    for (const link of FALLBACK_CONTACT_LINKS) {
      expect(screen.getAllByRole("link", { name: link.title })[0]).toHaveAttribute("href", link.href);
    }

    fillAndSubmit(container);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can also email me at mouaz.naji.dev@gmail.com.",
    );
  });

  it("keeps the thank-you line until the visitor edits the form again", async () => {
    jest.useFakeTimers();
    try {
      routeFetch({
        "/api/contact/prepare": () => jsonResponse(200, { ok: true, submissionId, uploads: [] }),
        "/api/contact/send": () => jsonResponse(200, { ok: true }),
      });
      const { container } = render(<ContactPage initialLinks={[]} />);
      expect(screen.queryByText(en.contact.sentThanks)).not.toBeInTheDocument();

      fillAndSubmit(container);
      // Shown in the form, and announced by the form's always-present status region.
      await screen.findByText(en.contact.sentThanks, { selector: "p" });
      expect(screen.getByText(en.contact.sentThanks, { selector: '[role="status"]' })).toBeInTheDocument();

      // The button returns to its idle label; the thank-you line stays.
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      expect(screen.getByText(en.contact.sentThanks, { selector: "p" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      fireEvent.change(container.querySelector("#contact-mobile-name")!, {
        target: { value: "M" },
      });
      expect(screen.queryAllByText(en.contact.sentThanks)).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("says when the browser blocks the cookie the form needs", async () => {
    routeFetch({});
    const cookieEnabled = jest.spyOn(navigator, "cookieEnabled", "get").mockReturnValue(false);
    const { container } = render(<ContactPage initialLinks={OWNER_EMAIL_LINKS} />);
    fillAndSubmit(container);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.contact.sendCookiesBlocked);
    expect(global.fetch).not.toHaveBeenCalled();
    cookieEnabled.mockRestore();
  });

  it("says when the server takes too long", async () => {
    routeFetch({
      "/api/contact/prepare": () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
    });
    const { container } = render(<ContactPage initialLinks={OWNER_EMAIL_LINKS} />);
    fillAndSubmit(container);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.contact.sendTimeout);
  });
});
