import { NextResponse } from "next/server";
import { readLimitedJson, RequestBodyError } from "@/lib/security/read-limited-json.server";
import { safeLog } from "@/lib/security/safe-logger.server";
import { CLIENT_REPORT_MAX_BYTES, parseClientReport } from "@/lib/telemetry/client-report";
import { reportClientKey } from "@/lib/telemetry/report-identity.server";
import { takeReportSlot } from "@/lib/telemetry/report-rate-limit.server";
import { describeUserAgent } from "@/lib/telemetry/user-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function reply(status: number) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Anonymous error reports from the site's own pages (see
 * lib/telemetry/report-client.ts). Reports are validated, reduced to a few
 * coarse fields and written to the server log only. No database; the
 * address is only used, hashed, for in-memory rate limiting; cookies are not
 * read.
 */
export async function POST(req: Request) {
  // Browsers send Sec-Fetch-Site with every fetch; other sites may not report.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return reply(403);

  let body: Record<string, unknown>;
  try {
    body = await readLimitedJson(req, CLIENT_REPORT_MAX_BYTES);
  } catch (error) {
    return reply(error instanceof RequestBodyError ? error.status : 400);
  }

  const report = parseClientReport(body);
  if (!report) return reply(400);
  // Over the limit: dropped quietly. An error status would only add console
  // noise on the visitor's device; the reporter has nothing to retry.
  if (!takeReportSlot(reportClientKey(req))) return reply(204);

  const { browser, os } = describeUserAgent(req.headers.get("user-agent"));
  safeLog("warn", "client.report", {
    kind: report.kind,
    browser,
    os,
    page: report.page,
    ...(report.message ? { message: report.message } : {}),
  });
  return reply(204);
}
