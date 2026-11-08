import { fireEvent, render, screen } from "@testing-library/react";
import * as navigation from "next/navigation";
import RouteScrollNavigator, {
  isInteractiveKeyTarget,
  resetWheelSession,
} from "@/components/navigation/RouteScrollNavigator";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

describe("RouteScrollNavigator input handling", () => {
  let push: jest.Mock;
  let prefetch: jest.Mock;

  beforeEach(() => {
    push = jest.fn();
    prefetch = jest.fn();
    (navigation.useRouter as jest.Mock).mockReturnValue({
      push,
      prefetch,
    } as unknown as ReturnType<typeof navigation.useRouter>);
    (navigation.usePathname as jest.Mock).mockReturnValue("/");
    resetWheelSession();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("ignores Space inside text entry controls", () => {
    render(
      <>
        <RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} />
        <textarea aria-label="Chat input" />
      </>,
    );

    const chatInput = screen.getByLabelText("Chat input");
    chatInput.focus();
    fireEvent.keyDown(chatInput, { key: " ", code: "Space" });

    expect(push).not.toHaveBeenCalled();
  });

  it("does not hijack global keyboard navigation", () => {
    render(<RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} />);

    fireEvent.keyDown(document.body, { key: " ", code: "Space" });

    expect(push).not.toHaveBeenCalled();
  });

  it("treats nested interactive targets as protected", () => {
    const button = document.createElement("button");
    const child = document.createElement("span");
    button.appendChild(child);

    expect(isInteractiveKeyTarget(child)).toBe(true);
  });

  it("allows the first deliberate wheel navigation immediately", () => {
    render(<RouteScrollNavigator routes={["/", "/skills-page"]} />);

    fireEvent.wheel(document.body, { deltaY: 140 });

    expect(prefetch).toHaveBeenCalledWith("/skills-page");
    expect(push).toHaveBeenCalledWith("/skills-page");
  });

  it("does not queue duplicate route pushes while navigation is pending", () => {
    render(
      <RouteScrollNavigator
        routes={["/", "/skills-page"]}
        cooldownMs={0}
        wheelThreshold={100}
      />,
    );

    fireEvent.wheel(document.body, { deltaY: 120 });
    fireEvent.wheel(document.body, { deltaY: 120 });

    expect(push).toHaveBeenCalledTimes(1);
  });

  function makeScroller({ scrollHeight, clientHeight, scrollTop }: {
    scrollHeight: number;
    clientHeight: number;
    scrollTop: number;
  }) {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    const child = document.createElement("p");
    scroller.appendChild(child);
    document.body.appendChild(scroller);
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: clientHeight });
    scroller.scrollTop = scrollTop;
    return { scroller, child };
  }

  it("scans scroll ancestors once per wheel gesture and still navigates when the inner scroller reaches its end", () => {
    const { scroller, child } = makeScroller({ scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    render(
      <RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} wheelThreshold={100} />,
    );
    const styleSpy = jest.spyOn(window, "getComputedStyle");

    fireEvent.wheel(child, { deltaY: 120 });
    const scansAfterFirstEvent = styleSpy.mock.calls.length;
    expect(scansAfterFirstEvent).toBeGreaterThan(0);
    expect(push).not.toHaveBeenCalled();

    // Inner area scrolled to its bottom during the same gesture: the cached
    // ancestor list is reused, but the live scroll position is honoured.
    scroller.scrollTop = 300;
    fireEvent.wheel(child, { deltaY: 120 });

    expect(styleSpy.mock.calls.length).toBe(scansAfterFirstEvent);
    expect(push).toHaveBeenCalledWith("/skills-page");

    styleSpy.mockRestore();
    scroller.remove();
  });

  it("attaches the non-passive touchmove listener only while an eligible touch is active", () => {
    const addSpy = jest.spyOn(window, "addEventListener");
    const removeSpy = jest.spyOn(window, "removeEventListener");
    render(
      <RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} touchThreshold={60} />,
    );

    const touchMoveAdds = () => addSpy.mock.calls.filter(([type]) => String(type) === "touchmove");
    expect(touchMoveAdds()).toHaveLength(0);

    fireEvent.touchStart(document.body, { touches: [{ clientY: 300 }] });
    expect(touchMoveAdds()).toHaveLength(1);
    expect(touchMoveAdds()[0][2]).toEqual({ passive: false });

    fireEvent.touchEnd(document.body, { touches: [] });
    expect(removeSpy.mock.calls.some(([type]) => String(type) === "touchmove")).toBe(true);

    // Interactive targets never arm the listener.
    const button = document.createElement("button");
    document.body.appendChild(button);
    fireEvent.touchStart(button, { touches: [{ clientY: 300 }] });
    expect(touchMoveAdds()).toHaveLength(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
    button.remove();
  });

  it("navigates on a vertical swipe past the threshold and prevents the default scroll", () => {
    render(
      <RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} touchThreshold={60} />,
    );

    fireEvent.touchStart(document.body, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(document.body, { touches: [{ clientY: 270 }] });
    expect(push).not.toHaveBeenCalled();

    const notCancelled = fireEvent.touchMove(document.body, { touches: [{ clientY: 230 }] });
    expect(push).toHaveBeenCalledWith("/skills-page");
    expect(notCancelled).toBe(false);
  });

  it("lets a scrollable ancestor consume the swipe until it reaches its end", () => {
    const { scroller, child } = makeScroller({ scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    render(
      <RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} touchThreshold={60} />,
    );

    fireEvent.touchStart(child, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(child, { touches: [{ clientY: 200 }] });
    expect(push).not.toHaveBeenCalled();

    scroller.scrollTop = 300;
    fireEvent.touchMove(child, { touches: [{ clientY: 190 }] });
    expect(push).toHaveBeenCalledWith("/skills-page");

    fireEvent.touchEnd(child, { touches: [] });
    scroller.remove();
  });

  it("leaves Ctrl/Cmd + wheel and trackpad pinch to the browser zoom", () => {
    render(<RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} wheelThreshold={100} />);
    const zoom = fireEvent.wheel(document.body, { deltaY: 400, ctrlKey: true });
    fireEvent.wheel(document.body, { deltaY: 400, metaKey: true });
    expect(push).not.toHaveBeenCalled();
    expect(zoom).toBe(true);
  });

  it("navigates once per touchpad flick even while momentum events keep arriving", () => {
    const now = jest.spyOn(performance, "now");
    let t = 10_000;
    now.mockImplementation(() => t);
    render(<RouteScrollNavigator routes={["/", "/skills-page", "/journey"]} cooldownMs={900} wheelThreshold={100} />);
    // A 2 s momentum tail, one event every 16 ms.
    for (let i = 0; i < 125; i += 1) {
      fireEvent.wheel(document.body, { deltaY: 40 });
      t += 16;
    }
    expect(push).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it("keeps ignoring a flick's momentum on the next page", () => {
    const now = jest.spyOn(performance, "now");
    let t = 10_000;
    now.mockImplementation(() => t);
    const first = render(<RouteScrollNavigator routes={["/", "/skills-page", "/journey"]} cooldownMs={900} wheelThreshold={100} />);
    fireEvent.wheel(document.body, { deltaY: 120 });
    expect(push).toHaveBeenCalledWith("/skills-page");
    // The new page mounts its own navigator while momentum is still arriving.
    first.unmount();
    (navigation.usePathname as jest.Mock).mockReturnValue("/skills-page");
    render(<RouteScrollNavigator routes={["/", "/skills-page", "/journey"]} cooldownMs={900} wheelThreshold={100} />);
    for (let i = 0; i < 125; i += 1) {
      t += 16;
      fireEvent.wheel(document.body, { deltaY: 40 });
    }
    expect(push).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it("adds up slow notch-by-notch mouse scrolling", () => {
    const now = jest.spyOn(performance, "now");
    let t = 10_000;
    now.mockImplementation(() => t);
    render(<RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} wheelThreshold={160} />);
    fireEvent.wheel(document.body, { deltaY: 100 });
    t += 400;
    fireEvent.wheel(document.body, { deltaY: 100 });
    expect(push).toHaveBeenCalledWith("/skills-page");
    now.mockRestore();
  });

  it("forgets small scrolls after a pause", () => {
    const now = jest.spyOn(performance, "now");
    let t = 10_000;
    now.mockImplementation(() => t);
    render(<RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} wheelThreshold={100} />);
    fireEvent.wheel(document.body, { deltaY: 60 });
    t += 5_000;
    fireEvent.wheel(document.body, { deltaY: 60 });
    expect(push).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it("ignores pinch gestures and panning while the page is zoomed in", () => {
    render(<RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} touchThreshold={60} />);
    fireEvent.touchStart(document.body, { touches: [{ clientY: 300 }, { clientY: 500 }] });
    fireEvent.touchMove(document.body, { touches: [{ clientY: 100 }, { clientY: 600 }] });
    fireEvent.touchEnd(document.body, { touches: [] });

    // One finger landed, then a second joins mid-gesture.
    fireEvent.touchStart(document.body, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(document.body, { touches: [{ clientY: 290 }, { clientY: 500 }] });
    fireEvent.touchMove(document.body, { touches: [{ clientY: 100 }] });
    fireEvent.touchEnd(document.body, { touches: [] });

    Object.defineProperty(window, "visualViewport", { configurable: true, value: { scale: 2 } });
    fireEvent.touchStart(document.body, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(document.body, { touches: [{ clientY: 100 }] });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });

    expect(push).not.toHaveBeenCalled();
  });

  it("keeps touch moves inside a scrolling list passive", () => {
    const addSpy = jest.spyOn(window, "addEventListener");
    const { scroller, child } = makeScroller({ scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    render(<RouteScrollNavigator routes={["/", "/skills-page"]} cooldownMs={0} touchThreshold={60} />);
    fireEvent.touchStart(child, { touches: [{ clientY: 300 }] });
    const moveListener = addSpy.mock.calls.find(([type]) => String(type) === "touchmove");
    expect(moveListener?.[2]).toEqual({ passive: true });
    fireEvent.touchEnd(child, { touches: [] });
    addSpy.mockRestore();
    scroller.remove();
  });
});
