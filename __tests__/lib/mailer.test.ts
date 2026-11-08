/**
 * @jest-environment node
 */

// mailer.ts reads its configuration and creates the transport at import time,
// so every test loads a fresh copy after setting the environment it needs.
// `server-only` (if added to mailer.ts) is mapped to an empty module by next/jest.

const sendMail = jest.fn();
const createTransport = jest.fn((options: unknown) => {
  void options;
  return { sendMail };
});

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: (options: unknown) => createTransport(options) },
}));

const ORIGINAL_ENV = process.env;

type Mailer = typeof import("@/lib/contact/mailer");

function loadMailer(env: Record<string, string | undefined>): Mailer {
  process.env = { ...ORIGINAL_ENV, ...env };
  let mailer!: Mailer;
  jest.isolateModules(() => {
    mailer = jest.requireActual<Mailer>("@/lib/contact/mailer");
  });
  return mailer;
}

describe("sendContactMail", () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({ messageId: "test" });
    createTransport.mockClear();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("refuses to send when CONTACT_TO is not configured", async () => {
    const { sendContactMail } = loadMailer({ CONTACT_TO: undefined });

    await expect(
      sendContactMail({ name: "Ada", email: "ada@example.com", message: "Hello" }),
    ).rejects.toThrow("CONTACT_TO is not set");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("keeps routing headers server-controlled and escapes visitor HTML", async () => {
    const { sendContactMail } = loadMailer({
      CONTACT_TO: "owner@example.com",
      CONTACT_SUBJECT: "Portfolio message",
      MAIL_FROM: "Portfolio <no-reply@example.com>",
    });

    await sendContactMail({
      name: "<b>Ada</b>",
      email: "ada@example.com",
      message: `<script>alert("x")</script> & 'quotes'`,
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({
      to: "owner@example.com",
      from: "Portfolio <no-reply@example.com>",
      subject: "Portfolio message",
      replyTo: "ada@example.com",
      disableFileAccess: true,
      disableUrlAccess: true,
      attachments: [],
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>Ada</b>");
    expect(mail.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;");
    expect(mail.html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
  });

  it("does not let visitor input reach the To, From or Subject headers", async () => {
    const { sendContactMail } = loadMailer({
      CONTACT_TO: "owner@example.com",
      CONTACT_SUBJECT: undefined,
      MAIL_FROM: undefined,
    });
    const injected = "Ada\r\nBcc: victim@example.com";

    await sendContactMail({ name: injected, email: "ada@example.com", message: injected });

    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("owner@example.com");
    expect(mail.from).toBe("Portfolio <no-reply@localhost>");
    expect(mail.subject).toBe("Message from your portfolio page");
    for (const header of [mail.to, mail.from, mail.subject, mail.replyTo]) {
      expect(header).not.toMatch(/[\r\n]/);
    }
  });

  it("forwards attachments without file or URL access", async () => {
    const { sendContactMail } = loadMailer({ CONTACT_TO: "owner@example.com" });
    const data = Buffer.from("%PDF-1.7");

    await sendContactMail({
      name: "Ada",
      email: "ada@example.com",
      message: "See attached",
      attachments: [{ name: "cv.pdf", type: "application/pdf", data }],
    });

    expect(sendMail.mock.calls[0][0].attachments).toEqual([
      { filename: "cv.pdf", content: data, contentType: "application/pdf", contentDisposition: "attachment" },
    ]);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ disableFileAccess: true, disableUrlAccess: true }),
    );
  });
});

describe("contact email header-injection guard", () => {
  // mailer.ts trusts its caller for the Reply-To address; the CRLF guard is
  // isValidEmail, which the contact API applies before a submission is stored.
  it("rejects CRLF header-injection payloads in the reply address", () => {
    const { isValidEmail } = jest.requireActual<typeof import("@/lib/contact/validate")>("@/lib/contact/validate");
    expect(isValidEmail("ada@example.com\r\nBcc: victim@example.com")).toBe(false);
    expect(isValidEmail("ada@example.com\nBcc: victim@example.com")).toBe(false);
    expect(isValidEmail("ada@example.com")).toBe(true);
  });
});
