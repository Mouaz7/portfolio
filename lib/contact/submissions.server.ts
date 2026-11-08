import "server-only";

import { supabaseAdmin } from "@/lib/backend/supabaseAdminClient";
import {
  CONTACT_MAX_FILES,
  CONTACT_MAX_TOTAL_BYTES,
} from "@/lib/contact/file-policy";
import type { MalwareScanStatus } from "@/lib/contact/malware-scanner.server";
import { logServerError } from "@/lib/security/safe-logger.server";

// Data access for two-step contact submissions (prepare -> upload -> send).
// Table and bucket names are shared with the prepare and cleanup routes.
export const CONTACT_SUBMISSION_TABLE = "contact_submission";
export const CONTACT_UPLOAD_TABLE = "contact_upload";
export const CONTACT_UPLOADS_BUCKET = "contact-uploads";

export type Submission = {
  email: string;
  id: string;
  message: string;
  name: string;
};

type UploadRow = {
  declared_mime: string;
  declared_size: number;
  id: string;
  object_path: string;
  original_name: string;
};

export type StorageObject = {
  metadata?: { size?: number } | null;
  name: string;
};

export class ContactSubmissionError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
    readonly code?: string,
    readonly attachmentStatus?: MalwareScanStatus,
  ) {
    super(publicMessage);
  }
}

function storageObjectSize(object: StorageObject): number | null {
  const size = Number(object.metadata?.size);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

export function validateStorageManifest(
  submissionId: string,
  uploads: UploadRow[],
  objects: StorageObject[],
): void {
  if (uploads.length > CONTACT_MAX_FILES || objects.length !== uploads.length) {
    throw new ContactSubmissionError(400, "Invalid attachments.", "attachment_invalid");
  }

  const expected = new Map(
    uploads.map((upload) => {
      const prefix = `${submissionId}/`;
      if (!upload.object_path.startsWith(prefix)) {
        throw new ContactSubmissionError(400, "Invalid attachments.", "attachment_invalid");
      }
      return [upload.object_path.slice(prefix.length), upload];
    }),
  );

  let actualTotal = 0;
  for (const object of objects) {
    const size = storageObjectSize(object);
    const upload = expected.get(object.name);
    if (!upload || size === null || size !== Number(upload.declared_size)) {
      throw new ContactSubmissionError(400, "Invalid attachments.", "attachment_invalid");
    }
    actualTotal += size;
    expected.delete(object.name);
  }

  if (expected.size > 0 || actualTotal > CONTACT_MAX_TOTAL_BYTES) {
    throw new ContactSubmissionError(400, "Invalid attachments.", "attachment_invalid");
  }
}

export async function pendingSubmission(
  submissionId: string,
  sessionHash: string,
): Promise<Submission> {
  const { data, error } = await supabaseAdmin
    .from(CONTACT_SUBMISSION_TABLE)
    .select("id,name,email,message")
    .eq("id", submissionId)
    .eq("session_hash", sessionHash)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  const submission = data as Submission | null;
  if (!submission) {
    throw new ContactSubmissionError(404, "Submission not found.", "submission_not_found");
  }
  return submission;
}

export async function submissionUploads(submissionId: string): Promise<UploadRow[]> {
  const { data, error } = await supabaseAdmin
    .from(CONTACT_UPLOAD_TABLE)
    .select("id,object_path,original_name,declared_mime,declared_size")
    .eq("submission_id", submissionId);
  if (error) throw error;
  return (data ?? []) as UploadRow[];
}

export async function recordScanStatus(
  uploadId: string,
  status: MalwareScanStatus,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(CONTACT_UPLOAD_TABLE)
    .update({
      scan_status: status,
      scanned_at: status === "pending_scan" ? null : new Date().toISOString(),
    })
    .eq("id", uploadId);
  if (error) throw error;
}

export async function markClaimFailed(submissionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(CONTACT_SUBMISSION_TABLE)
    .update({ status: "failed" })
    .eq("id", submissionId)
    .eq("status", "sending");
  if (error) {
    logServerError("api.contact.send.status_update_failed", error, {
      route: "/api/contact/send",
    });
  }
}
