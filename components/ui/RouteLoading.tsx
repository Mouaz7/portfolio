"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import PageLoadingStage from "./PageLoadingStage";

/** Route-level loading stage in the visitor's language. */
export default function RouteLoading() {
  const { dictionary } = useI18n();
  return <PageLoadingStage text={dictionary.common.loading} noun={dictionary.common.loadingPage} />;
}
