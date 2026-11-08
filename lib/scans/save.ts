import type { Identity } from "@/lib/auth/identity";
import type { Analysis } from "@/lib/analyze/schema";
import { PLANS } from "@/lib/plans";
import { saveScan } from "@/lib/scans/repository";
import { sanitizeFileName } from "@/lib/scans/sanitize";

type SaveInput = { fileName: string; buffer: Buffer; mimeType: string };
export type SaveResult = { saved: boolean; scanId?: string };

// Best effort: a failure here never blocks the verdict. Only plans with history are stored.
export async function saveScanIfEligible(
  identity: Identity,
  file: SaveInput,
  analysis: Analysis,
): Promise<SaveResult> {
  if (identity.kind !== "user" || !PLANS[identity.plan].history) return { saved: false };
  const scanId = crypto.randomUUID();
  try {
    await saveScan({
      scanId,
      userId: identity.userId,
      fileName: sanitizeFileName(file.fileName),
      buffer: file.buffer,
      mimeType: file.mimeType,
      analysis,
    });
    return { saved: true, scanId };
  } catch (error) {
    console.error("Could not save scan to history", { message: error instanceof Error ? error.message : "Unknown" });
    return { saved: false };
  }
}
