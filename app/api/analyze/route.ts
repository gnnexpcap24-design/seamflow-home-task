import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyImage } from "@/lib/analyze/classify";
import { AnalyzeError, type ApiErrorCode } from "@/lib/analyze/errors";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/analyze/schema";
import { errorResponse } from "@/lib/api-response";
import { attachVisitorCookie, getAuthUser, resolveIdentity, type AuthUser, type Identity } from "@/lib/auth/identity";
import { planGate } from "@/lib/auth/require-plan";
import { upgradeTarget } from "@/lib/plans";
import { consumeScan, getQuota, refundScan } from "@/lib/quota";
import { createRateLimiter, type RateLimitResult } from "@/lib/rate-limit";
import { saveScanIfEligible } from "@/lib/scans/save";
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

type Upload = { file: File | null; batchId: string | null };

async function readUpload(request: Request): Promise<Upload> {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const batchId = form.get("batchId");
    return {
      file: file instanceof File ? file : null,
      batchId: typeof batchId === "string" && batchId !== "" ? batchId : null,
    };
  } catch {
    return { file: null, batchId: null };
  }
}

// A batchId is only a grouping label, but batch upload is a Pro feature, so the server enforces it.
function checkBatch(identity: Identity, batchId: string | null): NextResponse | null {
  if (batchId === null) return null;
  const denied = planGate(identity, "pro");
  if (denied) return denied;
  return z.uuid().safeParse(batchId).success ? null : errorResponse("invalid_request");
}

async function checkFile(file: File): Promise<ApiErrorCode | null> {
  if (!isAllowedType(file.type)) return "unsupported_type";
  const head = new Uint8Array(await file.slice(0, MAGIC_BYTES_LENGTH).arrayBuffer());
  if (!matchesMagicBytes(head, file.type)) return "unsupported_type";
  return validateFileMeta(file, MAX_UPLOAD_BYTES);
}

// Quota is consumed before the model call and refunded if the analysis fails.
async function analyze(file: File, identity: Identity, batchId: string | null): Promise<NextResponse> {
  if (!(await consumeScan(identity))) {
    return errorResponse("quota_exceeded", { extra: { upgradeTo: upgradeTarget(identity.plan) } });
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const analysis = await classifyImage({ buffer, mimeType: file.type });
    const saveResult = await saveScanIfEligible(identity, { fileName: file.name, buffer, mimeType: file.type }, analysis, batchId ?? undefined);
    return NextResponse.json({
      ...analysis,
      lowConfidence: analysis.confidence < LOW_CONFIDENCE_THRESHOLD,
      analyzedAt: new Date().toISOString(),
      ...saveResult,
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

    const { file, batchId } = await readUpload(request);
    if (!file) return errorResponse("missing_file");
    const problem = await checkFile(file);
    if (problem) return errorResponse(problem);

    const identity = await resolveIdentity(user);
    const rejection = checkBatch(identity, batchId);
    if (rejection) return rejection;
    return attachVisitorCookie(await analyze(file, identity, batchId), identity);
  } catch (error) {
    console.error("Analyze request failed", { message: error instanceof Error ? error.message : "Unknown" });
    return errorResponse("server_error");
  }
}
