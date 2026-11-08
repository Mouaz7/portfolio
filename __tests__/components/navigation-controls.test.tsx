import { render as renderWithoutI18n } from "@testing-library/react";
import { act, fireEvent, render, screen, waitFor } from "@/tests/test-utils";
import LanguageSwitcher from "@/components/navigation/LanguageSwitcher";
import ThemeToggle from "@/components/navigation/ThemeToggle";
import EmailForm from "@/components/contact/email-form";
import TypeText from "@/components/home/TypeText";
import HelloBadge from "@/components/home/HelloBadge";
import {
  NavigationExperienceProvider,
  useNavigationExperience,
} from "@/components/navigation/NavigationExperienceProvider";

describe("LanguageSwitcher disclosure", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("exposes a disclosure with the active language marked as current", () => {
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole("button", { name: "Choose language" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(trigger).not.toHaveAttribute("aria-haspopup");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);

    const links = screen.getAllByRole("link");
    const current = links.filter((link) => link.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("hreflang", "en");
  });

  it("closes on Escape, restores focus to the trigger, and does not leak the key", () => {
    const outerEscape = jest.fn();
    document.addEventListener("keydown", outerEscape);
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole("button", { name: "Choose language" });

    fireEvent.click(trigger);
    screen.getAllByRole("link")[0].focus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(trigger).toHaveFocus();
    expect(outerEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outerEscape);
  });

  it("closes on a pointer press outside but not inside", () => {
    render(
      <>
        <LanguageSwitcher />
        <p>outside</p>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Choose language" });

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getAllByRole("link")[0]);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(screen.getByText("outside"));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the current query string when switching language", () => {
    window.history.replaceState({}, "", "/?technology=React");
    const blockNavigation = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("click", blockNavigation);

    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Choose language" }));

    const swedish = screen.getAllByRole("link").find((link) => link.getAttribute("hreflang") === "sv")!;
    expect(swedish).toHaveAttribute("href", "/sv?technology=React");

    window.history.replaceState({}, "", "/?technology=Docker");
    fireEvent.click(swedish);
    expect(swedish.getAttribute("href")).toBe("/sv?technology=Docker");

    document.removeEventListener("click", blockNavigation);
  });
});

describe("ThemeToggle instances", () => {
  afterEach(() => {
    document.documentElement.classList.remove("light");
  });

  it("keeps every instance in sync with the html theme class", async () => {
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );

    expect(screen.getAllByRole("button", { name: "Switch to light mode" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(document.documentElement).toHaveClass("light");
    expect(screen.getAllByRole("button", { name: "Switch to dark mode" })).toHaveLength(2);

    // External class changes (e.g. another tab script) propagate too.
    act(() => {
      document.documentElement.classList.remove("light");
    });
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Switch to light mode" })).toHaveLength(2);
    });
  });
});

describe("contact editor tabs", () => {
  it("uses a roving tabindex with arrow-key switching and only references mounted panels", () => {
    const { container } = render(<EmailForm idPrefix="t" initialLinks={[]} />);
    const write = container.querySelector<HTMLButtonElement>("#t-write-tab")!;
    const preview = container.querySelector<HTMLButtonElement>("#t-preview-tab")!;

    expect(write).toHaveAttribute("tabindex", "0");
    expect(preview).toHaveAttribute("tabindex", "-1");
    expect(write).toHaveAttribute("aria-controls", "t-write-panel");
    expect(preview).not.toHaveAttribute("aria-controls");

    write.focus();
    fireEvent.keyDown(write, { key: "ArrowRight" });

    expect(preview).toHaveAttribute("aria-selected", "true");
    expect(preview).toHaveFocus();
    expect(preview).toHaveAttribute("tabindex", "0");
    expect(write).toHaveAttribute("tabindex", "-1");
    expect(preview).toHaveAttribute("aria-controls", "t-preview-panel");
    expect(write).not.toHaveAttribute("aria-controls");
    expect(container.querySelector("#t-preview-panel")).toBeInTheDocument();

    fireEvent.keyDown(preview, { key: "ArrowLeft" });
    expect(write).toHaveAttribute("aria-selected", "true");
    expect(write).toHaveFocus();
  });

  it("switches back to Write to focus an empty message from Preview", async () => {
    const { container } = render(<EmailForm idPrefix="t" initialLinks={[]} />);

    fireEvent.change(container.querySelector("#t-name")!, { target: { value: "Mouaz" } });
    fireEvent.change(container.querySelector("#t-email")!, { target: { value: "a@example.com" } });
    fireEvent.click(container.querySelector("#t-preview-tab")!);
    expect(container.querySelector("#t-message")).not.toBeInTheDocument();

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(container.querySelector("#t-message")).toHaveFocus();
    });
    expect(container.querySelector("#t-write-tab")).toHaveAttribute("aria-selected", "true");
  });
});

describe("NavigationExperienceProvider", () => {
  it("marks internal navigation without re-rendering context consumers", () => {
    let renders = 0;
    let api: ReturnType<typeof useNavigationExperience> | null = null;
    function Consumer() {
      renders += 1;
      api = useNavigationExperience();
      return null;
    }
    render(
      <NavigationExperienceProvider>
        <Consumer />
      </NavigationExperienceProvider>,
    );
    const rendersBefore = renders;

    act(() => api!.markInternalNavigation("/skills?technology=React"));

    expect(renders).toBe(rendersBefore);
    expect(api!.shouldEnterInstantly("/skills")).toBe(true);
    expect(api!.shouldEnterInstantly("/journey")).toBe(false);
  });
});

describe("intro timers", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("TypeText fires onDone once and is not restarted by a new callback identity", () => {
    const first = jest.fn();
    const second = jest.fn();
    const third = jest.fn();
    const { rerender } = renderWithoutI18n(<TypeText text="Hi" start speedMs={10} onDone={first} />);

    act(() => jest.advanceTimersByTime(10));
    rerender(<TypeText text="Hi" start speedMs={10} onDone={second} />);
    act(() => jest.advanceTimersByTime(50));
    // A new callback identity after completion must not fire again.
    rerender(<TypeText text="Hi" start speedMs={10} onDone={third} />);

    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).not.toHaveBeenCalled();
  });

  it("HelloBadge keeps its timer when the parent passes a new onDone", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderWithoutI18n(<HelloBadge show durationMs={100} onDone={first} />);

    act(() => jest.advanceTimersByTime(120));
    rerender(<HelloBadge show durationMs={100} onDone={second} />);
    act(() => jest.advanceTimersByTime(40));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
