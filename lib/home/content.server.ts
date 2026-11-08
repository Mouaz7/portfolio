import "server-only";
import { cachedLoader } from "@/lib/cached-loader.server";
import { supabase } from "@/lib/backend/supabaseClient";
import {
  fallbackHomeContent,
  HOME_CAPABILITY_ICON_KEYS,
  withMasterProgrammeRole,
  type HomeCapabilityIconKey,
  type HomeContent,
} from "./types";
import type { Locale } from "@/lib/i18n/config";
import { getContentTranslations, translatedFields } from "@/lib/i18n/content-translations.server";


function isIconKey(value: string | null): value is HomeCapabilityIconKey {
  return HOME_CAPABILITY_ICON_KEYS.includes(value as HomeCapabilityIconKey);
}

async function loadHomeContent(locale: Locale): Promise<HomeContent> {
    const fallback = fallbackHomeContent(locale);
    const [profileResult, roleResult, capabilityResult, translations] = await Promise.all([
      supabase
        .from("site_profile")
        .select("id,intro_prefix,display_name,role_prefix")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle(),
      supabase.from("home_role").select("id,label").eq("is_active", true).order("sort_order"),
      supabase
        .from("home_capability")
        .select("id,title,description,icon_key")
        .eq("is_active", true)
        .order("sort_order"),
      getContentTranslations(locale, ["site_profile", "home_role", "home_capability"]),
    ]);

    // Throw rather than return the fallback: unstable_cache would otherwise
    // store fallback copy for the whole revalidate window after one bad query.
    // getHomeContent's catch serves the fallback uncached instead.
    const queryError = profileResult.error ?? roleResult.error ?? capabilityResult.error;
    if (queryError) throw queryError;

    const profile = profileResult.data;
    const roles = (roleResult.data ?? [])
      .map((role, index) => {
        const translated = translatedFields(translations, "home_role", role.id);
        return String(
          translated.label
          ?? (locale === "en" ? role.label : fallback.roleWords[index])
          ?? "",
        ).trim();
      })
      .filter(Boolean);
    const capabilities = (capabilityResult.data ?? [])
      .map((capability) => {
        const iconKey = typeof capability.icon_key === "string" ? capability.icon_key : null;
        if (!isIconKey(iconKey)) return null;

        const translated = translatedFields(translations, "home_capability", capability.id);
        const localizedFallback = fallback.capabilities.find((item) => item.id === capability.id);
        return {
          id: String(capability.id),
          title: String(translated.title ?? localizedFallback?.title ?? capability.title ?? "").trim(),
          description: String(translated.description ?? localizedFallback?.description ?? capability.description ?? "").trim(),
          iconKey,
        };
      })
      .filter((capability): capability is HomeContent["capabilities"][number] =>
        Boolean(capability?.title && capability.description),
      );

    const translatedProfile = translatedFields(translations, "site_profile", profile?.id);
    const roleWords = withMasterProgrammeRole(locale, roles.length > 0 ? roles : fallback.roleWords);
    const configuredRolePrefix = String(
      translatedProfile.role_prefix
      ?? (locale === "en" ? profile?.role_prefix : fallback.rolePrefix)
      ?? fallback.rolePrefix,
    );
    return {
      introPrefix: String(translatedProfile.intro_prefix ?? (locale === "en" ? profile?.intro_prefix : fallback.introPrefix) ?? fallback.introPrefix),
      displayName: String(translatedProfile.display_name ?? (locale === "en" ? profile?.display_name : fallback.displayName) ?? fallback.displayName),
      rolePrefix: roleWords[0] === fallback.roleWords[0] && configuredRolePrefix === "Software "
        ? ""
        : configuredRolePrefix,
      roleWords,
      capabilities: capabilities.length > 0 ? capabilities : fallback.capabilities,
    };
}

export async function getHomeContent(locale: Locale = "en"): Promise<HomeContent> {
  try {
    return await cachedLoader(
      () => loadHomeContent(locale),
      ["home-content-v4", locale],
      "homeContent",
    )();
  } catch {
    return fallbackHomeContent(locale);
  }
}
