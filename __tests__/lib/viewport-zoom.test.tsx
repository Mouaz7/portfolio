import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useFieldFocusWithin } from "@/hooks/useFieldFocusWithin";
import { useResponsiveSlide } from "@/hooks/useResponsiveSlide";
import { useViewportFitStage } from "@/hooks/useViewportFitStage";
import { layoutViewportSize } from "@/lib/viewport/layout-viewport";

function setVisualViewport(value: unknown) {
  Object.defineProperty(window, "visualViewport", { configurable: true, value });
}

afterEach(() => setVisualViewport(undefined));

describe("layoutViewportSize", () => {
  it("undoes pinch-zoom so zooming in does not shrink fitted pages", () => {
    const listeners = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
    setVisualViewport({ width: 195, height: 422, scale: 2, ...listeners });
    expect(layoutViewportSize()).toEqual({ width: 390, height: 844 });
    setVisualViewport({ width: 390, height: 500, scale: 1, ...listeners });
    expect(layoutViewportSize()).toEqual({ width: 390, height: 500 });
  });

  it("falls back to the window size without visualViewport", () => {
    expect(layoutViewportSize()).toEqual({ width: window.innerWidth, height: window.innerHeight });
  });
});

describe("useResponsiveSlide under zoom", () => {
  it("keeps full size when a tall phone is zoomed in", () => {
    setVisualViewport({ width: 195, height: 422, scale: 2, addEventListener: jest.fn(), removeEventListener: jest.fn() });
    const { result } = renderHook(() => useResponsiveSlide(560));
    expect(result.current.scale).toBe(1);
  });
});

describe("useResponsiveSlide without CSS zoom (Firefox ESR 115)", () => {
  it("scales the slide with a transform instead", () => {
    const original = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: unknown }).CSS = { supports: () => false };
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 280 });
    const { result } = renderHook(() => useResponsiveSlide(560));
    expect(result.current.scale).toBe(0.5);
    expect(result.current.style).toMatchObject({ transform: "scale(0.5)", width: "200%", transformOrigin: "top left" });
    expect(result.current.style).not.toHaveProperty("zoom");
    document.documentElement.dir = "rtl";
    const rtl = renderHook(() => useResponsiveSlide(560));
    expect(rtl.result.current.style).toMatchObject({ transformOrigin: "top right" });
    document.documentElement.dir = "";
    (globalThis as { CSS?: unknown }).CSS = original;
  });
});

describe("useViewportFitStage freeze", () => {
  it("ignores resizes while frozen and re-measures when released", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const { result, rerender } = renderHook(
      ({ freeze }) => useViewportFitStage({ baseWidth: 600, baseHeight: 400, padX: 0, padY: 0, freeze }),
      { initialProps: { freeze: false } },
    );
    expect(result.current.availableHeight).toBe(900);

    rerender({ freeze: true });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 300 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.availableHeight).toBe(900);

    rerender({ freeze: false });
    expect(result.current.availableHeight).toBe(300);
  });
});

describe("useFieldFocusWithin", () => {
  function Probe({ onChange }: { onChange: (focused: boolean) => void }) {
    const ref = useRef<HTMLElement>(null);
    onChange(useFieldFocusWithin(ref));
    return (
      <main ref={ref}>
        <input aria-label="name" />
        <textarea aria-label="message" />
        <button type="button">send</button>
      </main>
    );
  }

  it("is true while a field has focus, including moving between fields", () => {
    const states: boolean[] = [];
    const { getByLabelText, getByText } = render(<Probe onChange={(value) => states.push(value)} />);
    fireEvent.focusIn(getByLabelText("name"));
    expect(states.at(-1)).toBe(true);
    fireEvent.focusOut(getByLabelText("name"), { relatedTarget: getByLabelText("message") });
    expect(states.at(-1)).toBe(true);
    fireEvent.focusOut(getByLabelText("message"), { relatedTarget: getByText("send") });
    expect(states.at(-1)).toBe(false);
  });
});
