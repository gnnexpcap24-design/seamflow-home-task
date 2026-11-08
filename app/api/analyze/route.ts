import { classifyImage } from "@/lib/analyze/classify";
import { API_ERRORS, AnalyzeError, type ApiErrorCode } from "@/lib/analyze/errors";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/analyze/schema";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  MAGIC_BYTES_LENGTH,
  MAX_UPLOAD_BYTES,
  isAllowedType,
  matchesMagicBytes,
  validateFileMeta,
} from "@/lib/validation/file";

// Stays above the 20 s model timeout and below the platform limit.
export const maxDuration = 30;

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

function errorResponse(code: ApiErrorCode, headers?: HeadersInit): Response {
  const { status, message } = API_ERRORS[code];
  return Response.json({ error: { code, message } }, { status, headers });
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

async function readFile(request: Request): Promise<File | null> {
  try {
    const file = (await request.formData()).get("file");
    return file instanceof File ? file : null;
  } catch {
    return null;
  }
}

async function checkFile(file: File): Promise<ApiErrorCode | null> {
  if (!isAllowedType(file.type)) return "unsupported_type";
  const head = new Uint8Array(await file.slice(0, MAGIC_BYTES_LENGTH).arrayBuffer());
  if (!matchesMagicBytes(head, file.type)) return "unsupported_type";
  return validateFileMeta(file, MAX_UPLOAD_BYTES);
}

export async function POST(request: Request): Promise<Response> {
  const limit = limiter(clientIp(request));
  if (!limit.allowed) {
    return errorResponse("rate_limited", { "Retry-After": String(limit.retryAfterSeconds) });
  }

  const file = await readFile(request);
  if (!file) return errorResponse("missing_file");
  const problem = await checkFile(file);
  if (problem) return errorResponse(problem);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const analysis = await classifyImage({ buffer, mimeType: file.type });
    return Response.json({
      ...analysis,
      lowConfidence: analysis.confidence < LOW_CONFIDENCE_THRESHOLD,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error instanceof AnalyzeError ? error.code : "model_error");
  }
}
