import { NextResponse } from "next/server";
import { sharedCacheHeaders } from "@/lib/cache";
import { localeFromQuery } from "@/lib/i18n/config";
import {
  getJourney,
} from "@/lib/journey/data.server";
import { logServerError } from "@/lib/security/safe-logger.server";

export const revalidate = 7200;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const locale = localeFromQuery(request.url);
    return NextResponse.json(await getJourney(locale), {
      headers: sharedCacheHeaders(revalidate),
    });
  } catch (error) {
    logServerError("api.journey.database_failed", error, {
      route: "/api/journey",
    });
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
