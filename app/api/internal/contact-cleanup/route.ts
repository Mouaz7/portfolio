import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/backend/supabaseAdminClient";
import {
  CONTACT_SUBMISSION_TABLE,
  CONTACT_UPLOADS_BUCKET,
} from "@/lib/contact/submissions.server";
import { hasValidBearerSecret } from "@/lib/security/request-protection";
import { logServerError } from "@/lib/security/safe-logger.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  if (!hasValidBearerSecret(req, [process.env.CRON_SECRET])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: submissions, error } = await supabaseAdmin
    .from(CONTACT_SUBMISSION_TABLE)
    .select("id,contact_upload(object_path)")
    .lt("expires_at", new Date().toISOString())
    // Includes rows stuck in "sending": a send has a 45 s lease, so a
    // two-hour-old one was interrupted and must not be kept forever.
    .lt("created_at", cutoff)
    .limit(100);
  if (error) {
    logServerError("api.internal.contact_cleanup.query_failed", error, {
      route: "/api/internal/contact-cleanup",
    });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }

  const rows = submissions ?? [];
  const paths = rows.flatMap((submission) => {
    const uploads = Array.isArray(submission.contact_upload) ? submission.contact_upload : [];
    return uploads.flatMap((upload) =>
      upload && typeof upload.object_path === "string" ? [upload.object_path] : [],
    );
  });
  if (paths.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage.from(CONTACT_UPLOADS_BUCKET).remove(paths);
    if (storageError) {
      logServerError("api.internal.contact_cleanup.storage_failed", storageError, {
        route: "/api/internal/contact-cleanup",
      });
      return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
    }
  }

  const ids = rows.map((submission) => submission.id);
  if (ids.length > 0) {
    const { error: deleteError } = await supabaseAdmin.from(CONTACT_SUBMISSION_TABLE).delete().in("id", ids);
    if (deleteError) {
      logServerError("api.internal.contact_cleanup.delete_failed", deleteError, {
        route: "/api/internal/contact-cleanup",
      });
      return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, removed: ids.length });
}
