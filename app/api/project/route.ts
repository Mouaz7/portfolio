import { NextResponse } from "next/server";
import { sharedCacheHeaders } from "@/lib/cache";
import { localeFromQuery } from "@/lib/i18n/config";
import {
  getProjects,
  ProjectDatabaseError,
} from "@/lib/projects/data.server";
import { logServerError } from "@/lib/security/safe-logger.server";

export const revalidate = 1800;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const locale = localeFromQuery(req.url);

    return NextResponse.json(await getProjects(locale), {
      headers: sharedCacheHeaders(revalidate),
    });
  } catch (error) {
    if (error instanceof ProjectDatabaseError) {
      logServerError("api.projects.database_failed", error.cause, {
        route: "/api/project",
      });
      return NextResponse.json({ error: "db" }, { status: 500 });
    }
    logServerError("api.projects.failed", error, { route: "/api/project" });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
