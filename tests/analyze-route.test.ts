import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzeError } from "@/lib/analyze/errors";

const classifyImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analyze/classify", () => ({ classifyImage }));

import { POST } from "@/app/api/analyze/route";

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const verdict = { verdict: "hot_dog", confidence: 0.9, reason: "Sausage in a bun." };
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
}

describe("POST /api/analyze", () => {
  beforeEach(() => {
    classifyImage.mockReset().mockResolvedValue(verdict);
  });

  it("returns the verdict with lowConfidence and analyzedAt", async () => {
    const response = await post(jpeg());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ...verdict, lowConfidence: false });
    expect(new Date(body.analyzedAt).toISOString()).toBe(body.analyzedAt);
  });

  it("flags low confidence below 0.70", async () => {
    classifyImage.mockResolvedValue({ ...verdict, confidence: 0.69 });
    expect((await (await post(jpeg())).json()).lowConfidence).toBe(true);
  });

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

  it("429 rate_limited with Retry-After after 20 requests per minute", async () => {
    const ip = "192.168.1.1";
    for (let i = 0; i < 20; i++) expect((await post(jpeg(), ip)).status).toBe(200);
    const response = await post(jpeg(), ip);
    await expectError(response, 429, "rate_limited");
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
