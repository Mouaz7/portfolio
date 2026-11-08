import "server-only";

import { supabase } from "@/lib/backend/supabaseClient";
import type { Locale } from "./config";

type TranslationFields = Record<string, unknown>;
type ContentTranslationMap = Map<string, TranslationFields>;

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function translationKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export async function getContentTranslations(
  locale: Locale,
  entityTypes: string[],
): Promise<ContentTranslationMap> {
  if (locale === "en" || entityTypes.length === 0) return new Map();

  const { data, error } = await supabase
    .from("content_translation")
    .select("entity_type,entity_id,fields")
    .eq("locale", locale)
    .in("entity_type", entityTypes);

  if (error) {
    // Deployments remain functional while the additive migration rolls out,
    // but any other failure must propagate so callers never cache a result
    // that silently dropped every translation.
    if (error.code && MISSING_TABLE_CODES.has(error.code)) return new Map();
    throw error;
  }

  return new Map(
    (data ?? []).map((row) => [
      translationKey(String(row.entity_type), String(row.entity_id)),
      (row.fields && typeof row.fields === "object" ? row.fields : {}) as TranslationFields,
    ]),
  );
}

export function translatedFields(
  translations: ContentTranslationMap,
  entityType: string,
  entityId: unknown,
): TranslationFields {
  return translations.get(translationKey(entityType, String(entityId))) ?? {};
}
