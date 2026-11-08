import "server-only";

export class RequestBodyError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export async function readLimitedJson(
  req: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const testRequest = process.env.NODE_ENV === "test" && contentType === "text/plain";
  if (contentType !== "application/json" && !testRequest) {
    throw new RequestBodyError(415, "unsupported_media_type");
  }

  const announcedLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(announcedLength) && announcedLength > maxBytes) {
    throw new RequestBodyError(413, "body_too_large");
  }

  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestBodyError(413, "body_too_large");
    }
    chunks.push(value);
  }

  try {
    const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new RequestBodyError(400, "invalid_json");
  }
}
