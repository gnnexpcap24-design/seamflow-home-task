import { NextResponse } from "next/server";
import { classifyImage } from "@/lib/analyze/classify";
import { AnalyzeError, type ApiErrorCode } from "@/lib/analyze/errors";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/analyze/schema";
import { errorResponse } from "@/lib/api-response";
import { attachVisitorCookie, getAuthUser, resolveIdentity, type AuthUser, type Identity } from "@/lib/auth/identity";
import { upgradeTarget } from "@/lib/plans";
import { consumeScan, getQuota, refundScan } from "@/lib/quota";
import { createRateLimiter, type RateLimitResult } from "@/lib/rate-limit";
import {
  MAGIC_BYTES_LENGTH,
  MAX_UPLOAD_BYTES,
  isAllowedType,
  matchesMagicBytes,
  validateFileMeta,
} from "@/lib/validation/file";

// Stays above the 20 s model timeout and below the platform limit.
export const maxDuration = 30;

const visitorLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
const userLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

// Signed-in users are limited per account, everyone else per IP.
function checkRateLimit(request: Request, user: AuthUser | null): RateLimitResult {
  return user ? userLimiter(`user:${user.id}`) : visitorLimiter(`ip:${clientIp(request)}`);
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

// Quota is consumed before the model call and refunded if the analysis fails.
async function analyze(file: File, identity: Identity): Promise<NextResponse> {
  if (!(await consumeScan(identity))) {
    return errorResponse("quota_exceeded", { extra: { upgradeTo: upgradeTarget(identity.plan) } });
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const analysis = await classifyImage({ buffer, mimeType: file.type });
    return NextResponse.json({
      ...analysis,
      lowConfidence: analysis.confidence < LOW_CONFIDENCE_THRESHOLD,
      analyzedAt: new Date().toISOString(),
      quota: await getQuota(identity).catch(() => null),
    });
  } catch (error) {
    await refundScan(identity);
    return errorResponse(error instanceof AnalyzeError ? error.code : "model_error");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getAuthUser();
    const limit = checkRateLimit(request, user);
    if (!limit.allowed) {
      return errorResponse("rate_limited", { headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    }

    const file = await readFile(request);
    if (!file) return errorResponse("missing_file");
    const problem = await checkFile(file);
    if (problem) return errorResponse(problem);

    const identity = await resolveIdentity(user);
    return attachVisitorCookie(await analyze(file, identity), identity);
  } catch (error) {
    console.error("Analyze request failed", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
