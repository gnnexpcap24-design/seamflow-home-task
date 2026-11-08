import { ApiRequestError, requestAnalysis } from "@/lib/analyze/client";
import { API_ERRORS } from "@/lib/analyze/errors";
import { BatchFailure, type BatchResult } from "@/lib/batch/queue";
import { CompressionError, compressImage } from "@/lib/image/compress";
import { MAX_PICK_BYTES, validateFileMeta } from "@/lib/validation/file";

const TOO_BIG = "This image is larger than 10 MB. Choose a smaller image.";
const NETWORK = "We couldn't reach the server. Check your connection and try again.";

// Validates the file and compresses it in the browser, like the single-image flow.
export async function prepareFile(file: File): Promise<File> {
  const problem = validateFileMeta(file, MAX_PICK_BYTES);
  if (problem === "unsupported_type") throw new BatchFailure(API_ERRORS.unsupported_type.message, "unsupported_type");
  if (problem === "file_too_large") throw new BatchFailure(TOO_BIG, "file_too_large");
  try {
    return await compressImage(file);
  } catch (error) {
    const message = error instanceof CompressionError ? error.message : API_ERRORS.image_rejected.message;
    throw new BatchFailure(message, "compression_failed");
  }
}

// Sends one image to /api/analyze with the batch id and turns any failure into a BatchFailure.
export function analyzeInBatch(batchId: string) {
  return async (file: File): Promise<BatchResult> => {
    try {
      const { verdict, confidence, reason, lowConfidence, analyzedAt } = await requestAnalysis(file, batchId);
      return { verdict, confidence, reason, lowConfidence, analyzedAt };
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw new BatchFailure(error.message, error.code ?? "model_error", error.retryAfterSeconds);
      }
      throw new BatchFailure(NETWORK, "network");
    }
  };
}
