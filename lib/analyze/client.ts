import { API_ERRORS } from "@/lib/analyze/errors";
import type { AnalyzeResponse } from "@/lib/analyze/schema";
import type { Quota, UpgradeTarget } from "@/lib/plans";

const REQUEST_TIMEOUT_MS = 35_000;

export type AnalyzeResult = AnalyzeResponse & { quota: Quota | null };

// An error answered by our own API, with its code, user-facing message and optional retry delay.
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly upgradeTo?: UpgradeTarget | null,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  const seconds = Number(value);
  return value !== null && Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

// Sends one image to /api/analyze. A batchId groups the scan with others in history.
export async function requestAnalysis(file: File, batchId?: string): Promise<AnalyzeResult> {
  const body = new FormData();
  body.append("file", file);
  if (batchId) body.append("batchId", batchId);
  const response = await fetch("/api/analyze", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = data?.error;
    throw new ApiRequestError(
      apiError?.message ?? API_ERRORS.model_error.message,
      apiError?.code,
      apiError?.upgradeTo,
      parseRetryAfter(response.headers.get("Retry-After")),
    );
  }
  return data as AnalyzeResult;
}
