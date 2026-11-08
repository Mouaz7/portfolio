import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeContactSocial } from "@/lib/contact/social-links.server";
import {
  contactEmailFromLinks,
  FALLBACK_CONTACT_LINKS,
} from "@/lib/contact/social-links";

describe("contact social icon normalization", () => {
  it("keeps a safe SVG path and rejects a legacy external icon URL", () => {
    const path = normalizeContactSocial({
      id: 1, name: "GitHub", href: "https://github.com/mouaz", svg_path: "M12 2L2 12", viewbox: "0 0 24 24",
    });
    const image = normalizeContactSocial({
      id: 2, name: "LinkedIn", href: "https://linkedin.com/in/mouaz", svg_path: "https://cdn.simpleicons.org/linkedin", viewbox: null,
    });
    expect(path?.svgPath).toBe("M12 2L2 12");
    expect(image?.svgPath).toBe("");
  });

  it("allows the canonical Beacons profile and sanitizes its inline icon", () => {
    const link = normalizeContactSocial({
      id: 3,
      name: "Beacons",
      href: "https://beacons.ai/mouaz98",
      svg_path: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" /></svg>',
      viewbox: "0 0 24 24",
    });

    expect(link?.href).toBe("https://beacons.ai/mouaz98");
    expect(decodeURIComponent(link?.svgPath ?? "")).toContain("<circle");
    expect(link?.viewBox).toBe("1 2 17 20");
  });

  it("sanitizes raw SVG and rejects executable content", () => {
    const icon = normalizeContactSocial({
      id: 1,
      name: "Safe",
      href: "https://github.com/mouaz",
      svg_path: '<svg viewBox="0 0 24 24" onclick="alert(1)"><script>alert(1)</script><path d="M1 1" /></svg>',
      viewbox: null,
    });
    const decoded = decodeURIComponent(icon?.svgPath ?? "");
    expect(icon?.svgPath).toMatch(/^data:image\/svg\+xml,/);
    expect(decoded).not.toMatch(/script|onclick/i);
  });

  it("keeps removing blocked nodes and handlers until none can re-form", () => {
    const nested = normalizeContactSocial({
      id: 4,
      name: "Nested",
      href: "https://github.com/mouaz",
      svg_path: '<svg viewBox="0 0 24 24"><scr<script></script>ipt>alert(1)</script><path d="M1 1" /></svg>',
      viewbox: null,
    });
    // Removing the inner pair re-forms `<script>`; it must never survive.
    expect(decodeURIComponent(nested?.svgPath ?? "")).not.toMatch(/script|alert/i);

    const doubled = normalizeContactSocial({
      id: 7,
      name: "Doubled",
      href: "https://github.com/mouaz",
      svg_path: '<svg viewBox="0 0 24 24"><scr<script></script>ipt>x</scr<script></script>ipt><path d="M1 1" /></svg>',
      viewbox: null,
    });
    const doubledDecoded = decodeURIComponent(doubled?.svgPath ?? "");
    expect(doubled?.svgPath).toMatch(/^data:image\/svg\+xml,/);
    expect(doubledDecoded).not.toMatch(/script/i);
    expect(doubledDecoded).toContain("<path");

    const handler = normalizeContactSocial({
      id: 5,
      name: "Handler",
      href: "https://github.com/mouaz",
      svg_path: '<svg viewBox="0 0 24 24"><path d="M1 1" o onclick="a"nclick="alert(1)" /></svg>',
      viewbox: null,
    });
    expect(decodeURIComponent(handler?.svgPath ?? "")).not.toMatch(/on[a-z]+\s*=/i);

    const openTag = normalizeContactSocial({
      id: 6,
      name: "Open",
      href: "https://github.com/mouaz",
      svg_path: '<svg viewBox="0 0 24 24"><scr<script>ipt>alert(1)<path d="M1 1" /></svg>',
      viewbox: null,
    });
    expect(decodeURIComponent(openTag?.svgPath ?? "")).not.toMatch(/<\s*script/i);
  });

  it("rejects unsafe links and data URLs supplied by the database", () => {
    expect(normalizeContactSocial({ id: 1, name: "Bad", href: "javascript:alert(1)", svg_path: "M1 1", viewbox: null })).toBeNull();
    expect(normalizeContactSocial({ id: 1, name: "Bad", href: "https://example.com", svg_path: "data:image/svg+xml,<svg></svg>", viewbox: null })).toBeNull();
    expect(normalizeContactSocial({ id: 1, name: "GitHub", href: "https://github.com/mouaz", svg_path: "https://example.com/icon.svg", viewbox: null })?.svgPath).toBe("");
  });
});

describe("static contact link fallback", () => {
  // Rows of `insert into contact_social` in supabase/seed.sql:
  // (id, 'name', 'href', 'svg_path', 'viewbox', is_active, sort_order)
  const seed = readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8");
  const seedRows = Array.from(
    seed.matchAll(/^\s*\((\d+), '([^']+)', '([^']+)', '([^']+)', '([^']+)', (true|false), \d+\)/gm),
    ([, id, name, href, svgPath, viewbox, active]) => ({
      id: Number(id), name, href, svg_path: svgPath, viewbox, active: active === "true",
    }),
  );

  it("matches the seeded GitHub, LinkedIn and Email rows exactly", () => {
    expect(FALLBACK_CONTACT_LINKS.map((link) => link.title)).toEqual(["GitHub", "LinkedIn", "Email"]);
    for (const link of FALLBACK_CONTACT_LINKS) {
      const row = seedRows.find((candidate) => candidate.name === link.title);
      expect(row).toBeDefined();
      expect(row!.active).toBe(true);
      // Same shape and values as the server would produce from that row.
      expect(link).toEqual(normalizeContactSocial(row!));
    }
  });

  it("finds the contact address in the e-mail link", () => {
    expect(contactEmailFromLinks(FALLBACK_CONTACT_LINKS)).toBe("mouaz.naji.dev@gmail.com");
    expect(contactEmailFromLinks([])).toBeNull();
    expect(contactEmailFromLinks([
      { id: 9, title: "Mail", href: "mailto:someone%40example.com?subject=Hi", svgPath: "" },
    ])).toBe("someone@example.com");
  });
});
