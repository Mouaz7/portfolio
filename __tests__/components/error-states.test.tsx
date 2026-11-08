import type { ReactElement } from "react";
import { fireEvent, render as renderEn, screen, waitFor } from "@/tests/test-utils";
import { render as renderRaw } from "@testing-library/react";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n/config";
import en from "@/lib/i18n/dictionaries/en";
import sv from "@/lib/i18n/dictionaries/sv";
import ar from "@/lib/i18n/dictionaries/ar";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import Footer from "@/components/navigation/Footer";
import SkillsGrid from "@/components/skills/SkillsGrid";
import JourneyPage from "@/app/journey/journey-page";
import NotFound, { generateMetadata as notFoundMetadata } from "@/app/not-found";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { reportClientEvent } from "@/lib/telemetry/report-client";

const dictionaries = { en, sv, ar };

jest.mock("@/lib/i18n/request-locale", () => ({
  getRequestLocale: jest.fn(async () => "en"),
}));

jest.mock("@/lib/telemetry/report-client", () => ({
  reportClientEvent: jest.fn(() => false),
}));

jest.mock("@/components/navigation/Header", () => ({
  __esModule: true,
  default: () => <header data-testid="header" />,
}));

jest.mock("@/components/skills/useViewportStage", () => ({
  useViewportStage: () => ({
    isMeasured: true,
    profile: "fit",
    scale: 1,
    baseW: 730,
    baseH: 900,
    needsVerticalScroll: false,
    stageStyle: {},
    wrapperStyle: () => ({}),
  }),
}));

function renderIn(locale: Locale, ui: ReactElement) {
  return renderRaw(
    <I18nProvider locale={locale} dictionary={dictionaries[locale]}>{ui}</I18nProvider>,
  );
}

const failingFetch = () =>
  jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as unknown as typeof fetch;

describe("404 page", () => {
  it.each([
    ["en", "/"],
    ["sv", "/sv"],
    ["ar", "/ar"],
  ] as const)("renders the %s copy and links home to %s", async (locale, home) => {
    jest.mocked(getRequestLocale).mockResolvedValue(locale);
    const copy = dictionaries[locale].notFound;

    renderIn(locale, await NotFound());

    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.body)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.home })).toHaveAttribute("href", home);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByTestId("header")).toBeInTheDocument();

    const metadata = await notFoundMetadata();
    expect(metadata.title).toBe(dictionaries[locale].metadata.notFoundTitle);
  });
});

describe("footer privacy link", () => {
  it.each([
    ["en", "/privacy"],
    ["sv", "/sv/privacy"],
    ["ar", "/ar/privacy"],
  ] as const)("links to the %s privacy page", (locale, href) => {
    renderIn(locale, <Footer />);
    const link = screen.getByRole("link", { name: dictionaries[locale].footer.privacy });
    expect(link).toHaveAttribute("href", href);
    expect(link).not.toHaveAttribute("aria-current");
    // The copyright stays first and the logo last.
    expect(screen.getByText(new RegExp(dictionaries[locale].footer.rights.replace(".", "\\.")))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mouaz" })).toBeInTheDocument();
  });
});

describe("route error boundary", () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => consoleError.mockRestore());

  it("offers Retry and a localized link home", () => {
    const retry = jest.fn();
    const reset = jest.fn();
    renderIn("sv", <ErrorPage error={new Error("boom")} reset={reset} retry={retry} />);

    expect(screen.getByRole("heading", { name: sv.common.somethingWentWrong })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: sv.common.backHome })).toHaveAttribute("href", "/sv");
    fireEvent.click(screen.getByRole("button", { name: sv.common.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("is a focused main landmark with a level-1 heading", () => {
    renderEn(<ErrorPage error={new Error("boom")} reset={jest.fn()} />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveFocus();
    expect(screen.getByRole("heading", { level: 1, name: en.common.somethingWentWrong })).toBeInTheDocument();
  });

  it("handles a thrown value that is not an Error", () => {
    renderEn(<ErrorPage error={null as unknown as Error} reset={jest.fn()} />);
    expect(screen.getByRole("heading", { name: en.common.somethingWentWrong })).toBeInTheDocument();
    expect(reportClientEvent).toHaveBeenCalledWith("error", "page boundary object: null");
  });

  it("falls back to reset when retry is not provided", () => {
    const reset = jest.fn();
    renderEn(<ErrorPage error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: en.common.backHome })).toHaveAttribute("href", "/");
  });
});

describe("global error boundary", () => {
  // The boundary logs the error it caught; keep the test output clean.
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleError.mockRestore();
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
    document.documentElement.classList.remove("light");
    localStorage.clear();
  });

  it.each(["en", "sv", "ar"] as const)("uses the %s copy from the dictionaries", (locale) => {
    document.documentElement.lang = locale;
    renderRaw(<GlobalError error={new Error("boom")} reset={jest.fn()} />);
    const common = dictionaries[locale].common;

    expect(screen.getByRole("heading", { level: 1, name: common.somethingWentWrong })).toBeInTheDocument();
    expect(screen.getByText(common.criticalError)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: common.retry })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: common.backHome }))
      .toHaveAttribute("href", locale === "en" ? "/" : `/${locale}`);
  });

  it("follows the saved dark theme and sets the Arabic direction", () => {
    document.documentElement.lang = "ar";
    localStorage.setItem("theme", "dark");
    renderRaw(<GlobalError error={new Error("boom")} reset={jest.fn()} />);
    // React 19 renders <html> into the document's own root element.
    const html = document.documentElement;
    expect(html).toHaveAttribute("lang", "ar");
    expect(html).toHaveAttribute("dir", "rtl");
    expect(html).not.toHaveClass("light");
  });

  it("takes the language from the URL before the page language", () => {
    window.history.replaceState(null, "", "/sv/projects");
    document.documentElement.lang = "en";
    try {
      renderRaw(<GlobalError error={new Error("boom")} reset={jest.fn()} />);
      expect(screen.getByRole("heading", { level: 1, name: sv.common.somethingWentWrong })).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("uses the language cookie on the root path when the page has no language", () => {
    document.cookie = "portfolio-locale=ar; path=/";
    try {
      renderRaw(<GlobalError error={new Error("boom")} reset={jest.fn()} />);
      expect(screen.getByRole("heading", { level: 1, name: ar.common.somethingWentWrong })).toBeInTheDocument();
    } finally {
      document.cookie = "portfolio-locale=; path=/; max-age=0";
    }
  });

  it("retries, reports the error and focuses the heading", () => {
    const retry = jest.fn();
    renderRaw(<GlobalError error={new Error("boom")} reset={jest.fn()} retry={retry} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(reportClientEvent).toHaveBeenCalledWith("error", "global boundary Error: boom");
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("defaults to the light theme", () => {
    renderRaw(<GlobalError error={new Error("boom")} reset={jest.fn()} />);
    expect(document.documentElement).toHaveClass("light");
  });
});

describe("skills load error", () => {
  const previousFetch = global.fetch;
  afterEach(() => {
    global.fetch = previousFetch;
  });

  it("shows a localized error with Retry instead of an empty grid", async () => {
    global.fetch = failingFetch();
    renderIn("ar", <SkillsGrid />);

    expect(await screen.findByRole("alert")).toHaveTextContent(ar.skills.loadError);
    expect(document.querySelector(".skills-bento-grid")).not.toBeInTheDocument();

    const calls = (global.fetch as jest.Mock).mock.calls.length;
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("skill-categories")
        ? [{ key: "frontend", title: "Frontend", blurb: "Browser interfaces." }]
        : []),
    })) as unknown as typeof fetch;
    fireEvent.click(screen.getByRole("button", { name: ar.common.retry }));

    expect(await screen.findByRole("heading", { name: "Frontend" })).toBeInTheDocument();
    expect(screen.queryByText(ar.skills.loadError)).not.toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("keeps the normal grid when the server preloaded the data", () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    renderEn(
      <SkillsGrid
        initialCategories={[{ key: "frontend", title: "Frontend", blurb: "Browser interfaces." }]}
        initialSkills={[]}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Frontend" })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("skills empty state", () => {
  it("explains an empty list instead of showing nothing", () => {
    renderIn("sv", <SkillsGrid initialCategories={[]} initialSkills={[]} />);
    expect(screen.getByRole("heading", { name: sv.skills.emptyTitle })).toBeInTheDocument();
    expect(screen.getByText(sv.skills.emptyBody)).toBeInTheDocument();
  });
});

describe("journey load error", () => {
  const previousFetch = global.fetch;
  afterEach(() => {
    global.fetch = previousFetch;
  });

  it("shows the load error instead of 'No commits yet' and can retry", async () => {
    global.fetch = failingFetch();
    renderIn("sv", <JourneyPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(sv.journey.loadError);
    expect(screen.queryByText(sv.journey.noCommits)).not.toBeInTheDocument();

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    fireEvent.click(screen.getByRole("button", { name: sv.common.retry }));

    await waitFor(() => expect(screen.getByText(sv.journey.noCommits)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still shows 'No commits yet' for a successful empty load", () => {
    renderEn(<JourneyPage initialItems={[]} />);
    expect(screen.getByText(en.journey.noCommits)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
