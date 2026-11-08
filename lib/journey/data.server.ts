import "server-only";

import { cachedLoader } from "@/lib/cached-loader.server";
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { supabase } from "@/lib/backend/supabaseClient";
import { parseOrg, journeyIconForOrg, type JourneyItem } from "./deriveGitGraph";
import type { Locale } from "@/lib/i18n/config";
import {
  getContentTranslations,
  translatedFields,
} from "@/lib/i18n/content-translations.server";


type LogoInfo = { brand: string | null; mono: boolean };

const JOURNEY_COLUMNS =
  "id,title,details,start_date,end_date,icon_bucket,icon_path,icon_alt";

function safeLocalIconPath(icon: string): string | null {
  if (!icon.startsWith("/") || icon.includes("\\")) return null;
  const publicRoot = resolve(process.cwd(), "public");
  const candidate = resolve(publicRoot, `.${icon.split("?")[0]}`);
  // Only files that really ship in public/: an old stored path (from an
  // earlier asset layout) falls back to the organization's logo instead of
  // rendering a broken image.
  return candidate.startsWith(`${publicRoot}${sep}`) && existsSync(candidate) ? candidate : null;
}

function safeRemoteIcon(value: string): string | null {
  try {
    const candidate = new URL(value);
    const configuredUrl = process.env.SUPABASE_URL
      ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!configuredUrl || candidate.protocol !== "https:") return null;
    return candidate.origin === new URL(configuredUrl).origin
      ? candidate.toString()
      : null;
  } catch {
    return null;
  }
}

function safeStoragePath(value: string): string | null {
  if (!value || value.startsWith("/") || value.includes("\\")) return null;
  const segments = value.split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== "..")
    ? value
    : null;
}

// Brand tint for the bundled Journey logos, precomputed from the image files
// (average opaque colour; saturation below 0.25 renders as monochrome) so no
// request decodes images at runtime. Any other icon, including remote Storage
// logos, keeps the neutral theme tint.
const LOCAL_LOGO_INFO = new Map<string, LogoInfo>([
  ["/journey/bth-logo.webp", { brand: null, mono: true }],
  ["/journey/softhouse.webp", { brand: "#de833e", mono: false }],
]);
const NEUTRAL_LOGO_INFO: LogoInfo = { brand: null, mono: false };

function logoInfo(icon?: string): LogoInfo {
  return (icon && LOCAL_LOGO_INFO.get(icon.split("?")[0])) || NEUTRAL_LOGO_INFO;
}

function queryJourney() {
  return supabase
    .from("journey_item")
    .select(JOURNEY_COLUMNS)
    .eq("is_active", true)
    .order("start_date", { ascending: false })
    .limit(7);
}

export async function getJourney(locale: Locale): Promise<JourneyItem[]> {
  return cachedLoader(async () => {
    const [journeyResult, translations] = await Promise.all([
      queryJourney(),
      getContentTranslations(locale, ["journey_item"]),
    ]);
    const { data, error } = journeyResult;
    if (error) throw error;

    const mapped = (data ?? []).map((row) => {
      const translated = translatedFields(translations, "journey_item", row.id);
      const path = row.icon_path ?? "";
      const title = String(translated.title ?? row.title);
      const { org } = parseOrg(title);
      let icon: string | undefined;

      if (/^https?:\/\//i.test(path)) {
        icon = safeRemoteIcon(path) ?? undefined;
      } else if (path.startsWith("/")) {
        // A stored path whose file no longer exists falls back to the
        // organization's logo below.
        icon = safeLocalIconPath(path) ? path : undefined;
      } else if (path) {
        const storagePath = safeStoragePath(path);
        const bucket = typeof row.icon_bucket === "string"
          && /^[a-z0-9_-]+$/i.test(row.icon_bucket)
          ? row.icon_bucket
          : null;
        if (storagePath && bucket) {
          icon = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
        }
      }
      icon ??= journeyIconForOrg(org);
      const { brand, mono } = logoInfo(icon);

      return {
        id: row.id,
        title,
        description: String(translated.details ?? row.details ?? ""),
        icon,
        from: row.start_date,
        to: row.end_date ?? null,
        topic: String(translated.icon_alt ?? row.icon_alt ?? "") || null,
        brand,
        mono,
      };
    });

    mapped.sort(
      (left, right) => new Date(left.from).getTime() - new Date(right.from).getTime(),
    );
    return mapped;
  }, ["journey-seven-item-timeline", locale], "journey")();
}
