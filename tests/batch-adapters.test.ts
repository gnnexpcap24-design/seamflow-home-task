import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/analyze/client";
import { BatchFailure } from "@/lib/batch/queue";

const requestAnalysis = vi.hoisted(() => vi.fn());
const compressImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analyze/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analyze/client")>()),
  requestAnalysis,
}));
vi.mock("@/lib/image/compress", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image/compress")>()),
  compressImage,
}));

import { analyzeInBatch, prepareFile } from "@/lib/batch/adapters";
import { CompressionError } from "@/lib/image/compress";

const BATCH_ID = "5d1f6c1e-5c0a-4a52-9d58-3c5d2f8e7a10";
const file = new File(["x"], "a.jpg", { type: "image/jpeg" });

describe("analyzeInBatch", () => {
  beforeEach(() => {
    requestAnalysis.mockReset();
  });

  it("sends the file with the batch id and returns only the result fields", async () => {
    requestAnalysis.mockResolvedValue({
      verdict: "hot_dog", confidence: 0.9, reason: "ok", lowConfidence: false, analyzedAt: "t", saved: true, scanId: "s", quota: null,
    });
    const result = await analyzeInBatch(BATCH_ID)(file);
    expect(requestAnalysis).toHaveBeenCalledWith(file, BATCH_ID);
    expect(result).toEqual({ verdict: "hot_dog", confidence: 0.9, reason: "ok", lowConfidence: false, analyzedAt: "t" });
  });

  it("turns an API error into a BatchFailure that keeps the code and Retry-After", async () => {
    requestAnalysis.mockRejectedValue(new ApiRequestError("Slow down", "rate_limited", undefined, 9));
    const error = await analyzeInBatch(BATCH_ID)(file).catch((caught) => caught);
    expect(error).toBeInstanceOf(BatchFailure);
    expect(error).toMatchObject({ code: "rate_limited", message: "Slow down", retryAfterSeconds: 9 });
  });

  it("turns a network failure into a friendly BatchFailure", async () => {
    requestAnalysis.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await analyzeInBatch(BATCH_ID)(file).catch((caught) => caught);
    expect(error).toMatchObject({ code: "network" });
    expect(error.message).toContain("reach the server");
  });
});

describe("prepareFile", () => {
  beforeEach(() => {
    compressImage.mockReset();
  });

  it("compresses a valid file", async () => {
    const compressed = new File(["y"], "a.jpg", { type: "image/jpeg" });
    compressImage.mockResolvedValue(compressed);
    expect(await prepareFile(file)).toBe(compressed);
  });

  it("rejects an unsupported type without compressing", async () => {
    const error = await prepareFile(new File(["x"], "a.pdf", { type: "application/pdf" })).catch((caught) => caught);
    expect(error).toMatchObject({ code: "unsupported_type" });
    expect(compressImage).not.toHaveBeenCalled();
  });

  it("rejects a file over 10 MB", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    expect(await prepareFile(big).catch((caught) => caught)).toMatchObject({ code: "file_too_large" });
  });

  it("reports a compression failure with its message", async () => {
    compressImage.mockRejectedValue(new CompressionError("This image could not be read"));
    expect(await prepareFile(file).catch((caught) => caught)).toMatchObject({
      code: "compression_failed",
      message: "This image could not be read",
    });
  });
});
