import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzeError } from "@/lib/analyze/errors";

const classifyImage = vi.hoisted(() => vi.fn());
const getAuthUser = vi.hoisted(() => vi.fn());
const resolveIdentity = vi.hoisted(() => vi.fn());
const consumeScan = vi.hoisted(() => vi.fn());
const refundScan = vi.hoisted(() => vi.fn());
const getQuota = vi.hoisted(() => vi.fn());
const saveScanIfEligible = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analyze/classify", () => ({ classifyImage }));
vi.mock("@/lib/quota", () => ({ consumeScan, refundScan, getQuota }));
vi.mock("@/lib/scans/save", () => ({ saveScanIfEligible }));
vi.mock("@/lib/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/identity")>()),
  getAuthUser,
  resolveIdentity,
}));

import { POST } from "@/app/api/analyze/route";

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const verdict = { verdict: "hot_dog", confidence: 0.9, reason: "Sausage in a bun." };
const VISITOR_ID = "5d1f6c1e-5c0a-4a52-9d58-3c5d2f8e7a10";
const newVisitor = { kind: "visitor", plan: "visitor", visitorId: VISITOR_ID, isNewVisitor: true };
const returningVisitor = { ...newVisitor, isNewVisitor: false };
const freeUser = { kind: "user", plan: "free", userId: "u-free", email: null };
const quota = { plan: "visitor", used: 1, limit: 3, remaining: 2 };
let ipCounter = 0;

function jpeg(extraBytes = 0) {
  return new File([new Uint8Array([...JPEG_HEAD, ...new Array(extraBytes).fill(0)])], "a.jpg", {
    type: "image/jpeg",
  });
}

function post(file?: File, ip = `10.0.0.${++ipCounter}`) {
  const form = new FormData();
  if (file) form.append("file", file);
  return POST(new Request("http://localhost/api/analyze", { method: "POST", body: form, headers: { "x-forwarded-for": ip } }));
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body.error.code).toBe(code);
  expect(body.error.message.length).toBeGreaterThan(10);
  return body.error;
}

describe("POST /api/analyze", () => {
  beforeEach(() => {
    classifyImage.mockReset().mockResolvedValue(verdict);
    getAuthUser.mockReset().mockResolvedValue(null);
    resolveIdentity.mockReset().mockResolvedValue(returningVisitor);
    consumeScan.mockReset().mockResolvedValue(true);
    refundScan.mockReset().mockResolvedValue(undefined);
    getQuota.mockReset().mockResolvedValue(quota);
    saveScanIfEligible.mockReset().mockResolvedValue({ saved: false });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("verdict", () => {
    it("returns the verdict with lowConfidence, analyzedAt and quota", async () => {
      const response = await post(jpeg());
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ...verdict, lowConfidence: false, quota });
      expect(new Date(body.analyzedAt).toISOString()).toBe(body.analyzedAt);
    });

    it("flags low confidence below 0.70", async () => {
      classifyImage.mockResolvedValue({ ...verdict, confidence: 0.69 });
      expect((await (await post(jpeg())).json()).lowConfidence).toBe(true);
    });

    it("still returns the verdict when the quota lookup fails", async () => {
      getQuota.mockRejectedValue(new Error("db down"));
      const body = await (await post(jpeg())).json();
      expect(body).toMatchObject({ ...verdict, quota: null });
    });
  });

  describe("history", () => {
    it("returns saved and scanId when the scan was stored", async () => {
      saveScanIfEligible.mockResolvedValue({ saved: true, scanId: "scan-1" });
      const body = await (await post(jpeg())).json();
      expect(body).toMatchObject({ saved: true, scanId: "scan-1" });
    });

    it("still returns the verdict with saved false when saving fails", async () => {
      saveScanIfEligible.mockResolvedValue({ saved: false });
      const response = await post(jpeg());
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ...verdict, saved: false });
      expect(body.scanId).toBeUndefined();
      expect(refundScan).not.toHaveBeenCalled();
    });

    it("hands the save step the identity, the sanitized upload and the analysis", async () => {
      await post(jpeg());
      expect(saveScanIfEligible).toHaveBeenCalledWith(
        returningVisitor,
        expect.objectContaining({ fileName: "a.jpg", mimeType: "image/jpeg" }),
        verdict,
      );
    });

    it("does not try to save when the classification failed", async () => {
      classifyImage.mockRejectedValue(new AnalyzeError("model_error"));
      await post(jpeg());
      expect(saveScanIfEligible).not.toHaveBeenCalled();
    });
  });

  describe("file errors", () => {
    it("400 missing_file when no file is sent", async () => {
      await expectError(await post(undefined), 400, "missing_file");
    });

    it("400 missing_file when the body is not multipart", async () => {
      const request = new Request("http://localhost/api/analyze", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
      await expectError(await POST(request), 400, "missing_file");
    });

    it("415 unsupported_type for a PDF", async () => {
      await expectError(await post(new File(["%PDF"], "a.pdf", { type: "application/pdf" })), 415, "unsupported_type");
    });

    it("415 unsupported_type for a PDF renamed to .jpg", async () => {
      await expectError(await post(new File(["%PDF-1.7 not an image"], "a.jpg", { type: "image/jpeg" })), 415, "unsupported_type");
      expect(classifyImage).not.toHaveBeenCalled();
    });

    it("413 file_too_large over 4 MB", async () => {
      await expectError(await post(jpeg(4 * 1024 * 1024)), 413, "file_too_large");
      expect(classifyImage).not.toHaveBeenCalled();
    });

    it("does not touch quota for an invalid file", async () => {
      await post(new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
      expect(consumeScan).not.toHaveBeenCalled();
    });
  });

  describe("model errors", () => {
    it("422 image_rejected", async () => {
      classifyImage.mockRejectedValue(new AnalyzeError("image_rejected"));
      await expectError(await post(jpeg()), 422, "image_rejected");
    });

    it("502 model_error", async () => {
      classifyImage.mockRejectedValue(new AnalyzeError("model_error"));
      await expectError(await post(jpeg()), 502, "model_error");
    });

    it("504 timeout", async () => {
      classifyImage.mockRejectedValue(new AnalyzeError("timeout"));
      await expectError(await post(jpeg()), 504, "timeout");
    });

    it("502 model_error for an unexpected failure", async () => {
      classifyImage.mockRejectedValue(new Error("boom"));
      await expectError(await post(jpeg()), 502, "model_error");
    });
  });

  describe("quota", () => {
    it("403 quota_exceeded with upgradeTo account for a visitor", async () => {
      consumeScan.mockResolvedValue(false);
      const error = await expectError(await post(jpeg()), 403, "quota_exceeded");
      expect(error.upgradeTo).toBe("account");
      expect(classifyImage).not.toHaveBeenCalled();
    });

    it("403 quota_exceeded with upgradeTo pro for a free account", async () => {
      getAuthUser.mockResolvedValue({ id: "u-free", email: null });
      resolveIdentity.mockResolvedValue(freeUser);
      consumeScan.mockResolvedValue(false);
      const error = await expectError(await post(jpeg()), 403, "quota_exceeded");
      expect(error.upgradeTo).toBe("pro");
    });

    it("does not refund when the quota was never consumed", async () => {
      consumeScan.mockResolvedValue(false);
      await post(jpeg());
      expect(refundScan).not.toHaveBeenCalled();
    });

    it("refunds the scan when the classification fails", async () => {
      classifyImage.mockRejectedValue(new AnalyzeError("model_error"));
      await post(jpeg());
      expect(refundScan).toHaveBeenCalledWith(returningVisitor);
    });

    it("does not refund after a successful analysis", async () => {
      await post(jpeg());
      expect(consumeScan).toHaveBeenCalledWith(returningVisitor);
      expect(refundScan).not.toHaveBeenCalled();
    });

    it("500 server_error when the quota database call fails", async () => {
      consumeScan.mockRejectedValue(new Error("db down"));
      await expectError(await post(jpeg()), 500, "server_error");
      expect(classifyImage).not.toHaveBeenCalled();
    });
  });

  describe("visitor cookie", () => {
    it("sets an httpOnly cookie for a new visitor", async () => {
      resolveIdentity.mockResolvedValue(newVisitor);
      const header = (await post(jpeg())).headers.get("set-cookie") ?? "";
      expect(header).toContain(`hdn_vid=${VISITOR_ID}`);
      expect(header).toContain("HttpOnly");
    });

    it("also sets the cookie when the first scan is over quota", async () => {
      resolveIdentity.mockResolvedValue(newVisitor);
      consumeScan.mockResolvedValue(false);
      expect((await post(jpeg())).headers.get("set-cookie")).toContain("hdn_vid=");
    });

    it("does not set a cookie for a returning visitor", async () => {
      expect((await post(jpeg())).headers.get("set-cookie")).toBeNull();
    });
  });

  describe("rate limit", () => {
    it("429 rate_limited with Retry-After after 20 requests per minute per IP", async () => {
      const ip = "192.168.1.1";
      for (let i = 0; i < 20; i++) expect((await post(jpeg(), ip)).status).toBe(200);
      const response = await post(jpeg(), ip);
      await expectError(response, 429, "rate_limited");
      expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    });

    it("limits signed-in users per account with a higher limit than visitors", async () => {
      getAuthUser.mockResolvedValue({ id: "u-rate", email: null });
      resolveIdentity.mockResolvedValue({ ...freeUser, userId: "u-rate" });
      for (let i = 0; i < 60; i++) expect((await post(jpeg(), "172.16.0.1")).status).toBe(200);
      await expectError(await post(jpeg(), "172.16.0.1"), 429, "rate_limited");
    });
  });
});
