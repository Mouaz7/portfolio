// One MutationObserver on <html class> for the whole page. The theme is the
// `light` class on <html> (set before paint by the inline theme script, then
// by ThemeToggle); everything that follows theme changes subscribes here.

type Subscriber = {
  listener: () => void;
  /** Also called synchronously by notifyThemeChange(), inside the click. */
  immediate: boolean;
  /** The <html> class list this subscriber last saw, so it hears each change once. */
  seen: string;
};

const subscribers = new Set<Subscriber>();
let observer: MutationObserver | null = null;

function notify(immediateOnly: boolean) {
  const className = document.documentElement.className;
  for (const subscriber of subscribers) {
    if (immediateOnly && !subscriber.immediate) continue;
    if (subscriber.seen === className) continue;
    subscriber.seen = className;
    subscriber.listener();
  }
}

/**
 * Tells immediate subscribers (UI that must change within the click, such as
 * every theme button) right away. Everyone else, e.g. the background
 * repainting its waves, hears it from the observer just after the click, so
 * the click itself stays fast.
 */
export function notifyThemeChange() {
  notify(true);
}

/** Calls `listener` whenever the class list of <html> changes. */
export function subscribeToThemeChanges(
  listener: () => void,
  { immediate = false }: { immediate?: boolean } = {},
): () => void {
  const subscriber: Subscriber = { listener, immediate, seen: document.documentElement.className };
  subscribers.add(subscriber);
  if (!observer) {
    observer = new MutationObserver(() => notify(false));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

export function isLightTheme(): boolean {
  return document.documentElement.classList.contains("light");
}
