import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/backend/supabaseAdminClient";
import { validateContactFileBytes } from "@/lib/contact/file-signature.server";
import {
  CONTACT_MAX_FILES,
  CONTACT_MAX_TOTAL_BYTES,
  sanitizeAttachmentName,
} from "@/lib/contact/file-policy";
import { sendContactMail } from "@/lib/contact/mailer";
import { scanAttachment } from "@/lib/contact/malware-scanner.server";
import {
  CONTACT_SUBMISSION_TABLE,
  CONTACT_UPLOADS_BUCKET,
  ContactSubmissionError,
  markClaimFailed,
  pendingSubmission,
  recordScanStatus,
  submissionUploads,
  validateStorageManifest,
  type StorageObject,
  type Submission,
} from "@/lib/contact/submissions.server";
import {
  acquireConcurrency,
  identifyApiRequest,
  readLimitedJson,
  releaseProtection,
  RequestBodyError,
  secureResponse,
} from "@/lib/security/request-protection";
import { logServerError } from "@/lib/security/safe-logger.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const securityContext = identifyApiRequest(req);
  let cleanupPaths: string[] = [];
  let submissionId = "";
  let claimed = false;

  try {
    const body = await readLimitedJson(req, 4 * 1024);
    submissionId = typeof body.submissionId === "string"
      ? body.submissionId
      : "";
    if (!/^[a-f0-9-]{36}$/i.test(submissionId)) {
      throw new ContactSubmissionError(400, "Invalid submission.");
    }

    await pendingSubmission(submissionId, securityContext.sessionHash);
    const uploads = await submissionUploads(submissionId);
    const storage = supabaseAdmin.storage.from(CONTACT_UPLOADS_BUCKET);
    const { data: objectData, error: listError } = await storage.list(
      submissionId,
      { limit: CONTACT_MAX_FILES + 1 },
    );
    if (listError) throw listError;
    validateStorageManifest(
      submissionId,
      uploads,
      (objectData ?? []) as StorageObject[],
    );

    if (!(await acquireConcurrency(securityContext, "contact_send", 2))) {
      return secureResponse(
        NextResponse.json(
          { ok: false, error: "Service is busy.", code: "busy" },
          { status: 503 },
        ),
        securityContext,
      );
    }

    const { data: claimData, error: claimError } = await supabaseAdmin.rpc(
      "claim_contact_submission",
      {
        p_session_hash: securityContext.sessionHash,
        p_submission_id: submissionId,
      },
    );
    if (claimError) throw claimError;
    const submission = Array.isArray(claimData)
      ? claimData[0] as Submission | undefined
      : undefined;
    if (!submission) {
      throw new ContactSubmissionError(404, "Submission not found.");
    }
    claimed = true;
    cleanupPaths = uploads.map((upload) => upload.object_path);

    const attachments: Array<{ data: Buffer; name: string; type: string }> = [];
    let downloadedTotal = 0;
    for (const upload of uploads) {
      const { data, error } = await storage.download(upload.object_path);
      if (error || !data) throw error ?? new Error("Attachment missing");
      const buffer = Buffer.from(await data.arrayBuffer());
      downloadedTotal += buffer.length;
      if (downloadedTotal > CONTACT_MAX_TOTAL_BYTES) {
        throw new ContactSubmissionError(400, "Invalid attachments.", "attachment_invalid");
      }
      const metadata = {
        name: upload.original_name,
        size: Number(upload.declared_size),
        type: upload.declared_mime,
      };
      if (!validateContactFileBytes(metadata, buffer)) {
        throw new ContactSubmissionError(400, "Invalid attachments.", "attachment_invalid");
      }

      const scan = await scanAttachment({
        data: buffer,
        mediaType: upload.declared_mime,
        name: sanitizeAttachmentName(upload.original_name),
      });
      await recordScanStatus(upload.id, scan.status);
      if (scan.status === "infected") {
        throw new ContactSubmissionError(
          422,
          "An attachment could not be accepted.",
          "attachment_infected",
          "infected",
        );
      }
      if (scan.status !== "clean") {
        throw new ContactSubmissionError(
          503,
          "Attachment scanning is temporarily unavailable.",
          "attachment_scan_failed",
          "scan_failed",
        );
      }
      attachments.push({
        data: buffer,
        name: sanitizeAttachmentName(upload.original_name),
        type: upload.declared_mime,
      });
    }

    await sendContactMail({
      attachments,
      email: submission.email,
      message: submission.message,
      name: submission.name,
    });
    const { error: updateError } = await supabaseAdmin
      .from(CONTACT_SUBMISSION_TABLE)
      .update({
        sent_at: new Date().toISOString(),
        status: "sent",
      })
      .eq("id", submissionId)
      .eq("status", "sending");
    if (updateError) throw updateError;

    return secureResponse(NextResponse.json({ ok: true }), securityContext);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return secureResponse(
        NextResponse.json(
          {
            ok: false,
            error: "Invalid request body.",
            code: error.code,
          },
          { status: error.status },
        ),
        securityContext,
      );
    }
    if (error instanceof ContactSubmissionError) {
      if (claimed && submissionId) await markClaimFailed(submissionId);
      return secureResponse(
        NextResponse.json(
          {
            ok: false,
            error: error.publicMessage,
            ...(error.code ? { code: error.code } : {}),
            ...(error.attachmentStatus
              ? { attachmentStatus: error.attachmentStatus }
              : {}),
          },
          { status: error.status },
        ),
        securityContext,
      );
    }

    logServerError("api.contact.send.failed", error, {
      route: "/api/contact/send",
    });
    if (claimed && submissionId) await markClaimFailed(submissionId);
    return secureResponse(
      NextResponse.json(
        { ok: false, error: "Server error." },
        { status: 500 },
      ),
      securityContext,
    );
  } finally {
    if (claimed && cleanupPaths.length > 0) {
      const { error } = await supabaseAdmin.storage
        .from(CONTACT_UPLOADS_BUCKET)
        .remove(cleanupPaths);
      if (error) {
        logServerError("api.contact.send.cleanup_failed", error, {
          route: "/api/contact/send",
        });
      }
    }
    await releaseProtection(securityContext);
  }
}
