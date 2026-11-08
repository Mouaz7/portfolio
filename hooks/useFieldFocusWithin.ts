"use client";

import { useEffect, useState, type RefObject } from "react";

const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

function isField(target: EventTarget | null) {
  return target instanceof Element && target.closest(FIELD_SELECTOR) !== null;
}

/**
 * True while a text field inside `containerRef` has focus. On phones and
 * tablets the on-screen keyboard resizes the page while typing; layouts that
 * fit themselves to the viewport use this to hold still until the field is
 * left.
 */
export function useFieldFocusWithin(containerRef: RefObject<HTMLElement | null>) {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onFocusIn = (event: FocusEvent) => {
      if (isField(event.target)) setFocused(true);
    };
    const onFocusOut = (event: FocusEvent) => {
      // Moving between two fields keeps the freeze.
      if (!(event.relatedTarget instanceof Node && container.contains(event.relatedTarget) && isField(event.relatedTarget))) {
        setFocused(false);
      }
    };
    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("focusout", onFocusOut);
    return () => {
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
    };
  }, [containerRef]);

  return focused;
}
