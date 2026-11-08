type Store = typeof import("@/lib/theme/theme-store");

function freshStore(): Store {
  let store!: Store;
  jest.isolateModules(() => {
    store = jest.requireActual("@/lib/theme/theme-store");
  });
  return store;
}

const flushObservers = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("theme store", () => {
  afterEach(() => document.documentElement.classList.remove("light"));

  it("reports each theme change once, whether notified directly or observed", async () => {
    const { subscribeToThemeChanges, notifyThemeChange, isLightTheme } = freshStore();
    const listener = jest.fn();
    const unsubscribe = subscribeToThemeChanges(listener, { immediate: true });

    document.documentElement.classList.add("light");
    notifyThemeChange();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isLightTheme()).toBe(true);
    await flushObservers(); // the observer sees the same change
    expect(listener).toHaveBeenCalledTimes(1);

    document.documentElement.classList.remove("light");
    await flushObservers();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("keeps heavy listeners out of the click: they hear the change from the observer", async () => {
    const { subscribeToThemeChanges, notifyThemeChange } = freshStore();
    const button = jest.fn();
    const background = jest.fn();
    const unsubscribeButton = subscribeToThemeChanges(button, { immediate: true });
    const unsubscribeBackground = subscribeToThemeChanges(background);
    document.documentElement.classList.add("light");
    notifyThemeChange();
    expect(button).toHaveBeenCalledTimes(1);
    expect(background).not.toHaveBeenCalled();
    await flushObservers();
    expect(button).toHaveBeenCalledTimes(1);
    expect(background).toHaveBeenCalledTimes(1);
    unsubscribeButton();
    unsubscribeBackground();
  });

  it("stops observing when the last listener leaves", async () => {
    const { subscribeToThemeChanges } = freshStore();
    const listener = jest.fn();
    subscribeToThemeChanges(listener)();
    document.documentElement.classList.add("light");
    await flushObservers();
    expect(listener).not.toHaveBeenCalled();
  });
});
