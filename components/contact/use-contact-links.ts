"use client";

import { useEffect, useState } from "react";
import {
  FALLBACK_CONTACT_LINKS,
  type ContactSocialLink,
} from "@/lib/contact/social-links";

/**
 * Social links for the contact page. The page passes the links it loaded on
 * the server; `undefined` means that load failed, so the static fallback is
 * shown straight away (no empty state, no layout jump) while the API is
 * retried in the browser.
 */
export function useContactLinks(
  enabled = true,
  initialLinks?: ContactSocialLink[],
): ContactSocialLink[] {
  const [links, setLinks] = useState<ContactSocialLink[]>(
    () => initialLinks ?? (enabled ? [...FALLBACK_CONTACT_LINKS] : []),
  );

  useEffect(() => {
    if (!enabled) {
      setLinks([]);
      return;
    }

    if (initialLinks) {
      setLinks(initialLinks);
      return;
    }

    const controller = new AbortController();
    void fetch("/api/contact", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (Array.isArray(data)) setLinks(data as ContactSocialLink[]);
        else throw new Error("Unexpected contact links response");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLinks([...FALLBACK_CONTACT_LINKS]);
      });

    return () => controller.abort();
  }, [enabled, initialLinks]);

  return links;
}
