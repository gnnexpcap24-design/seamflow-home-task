import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyImage } from "@/lib/analyze/classify";
import { AnalyzeError } from "@/lib/analyze/errors";

const parse = vi.fn();
const client = { responses: { parse } } as unknown as OpenAI;
const image = { buffer: Buffer.from("fake-image-bytes"), mimeType: "image/jpeg" };
const options = { client, retryDelayMs: 0 };

const good = { output: [], output_parsed: { verdict: "hot_dog", confidence: 0.9, reason: "Sausage in a bun." } };
const malformed = { output: [], output_parsed: { verdict: "maybe", confidence: 2, reason: "?" } };
const refusal = { output: [{ type: "message", content: [{ type: "refusal", refusal: "No." }] }], output_parsed: null };

const rateLimitError = () => new OpenAI.RateLimitError(429, { message: "x" }, "x", new Headers());
const serverError = () => new OpenAI.InternalServerError(500, { message: "x" }, "x", new Headers());

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(AnalyzeError);
  return (error as AnalyzeError).code;
}

describe("classifyImage", () => {
  beforeEach(() => {
    parse.mockReset();
    process.env.OPENAI_VISION_MODEL = "test-model";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns a validated result and sends one image as a data URL", async () => {
    parse.mockResolvedValue(good);
    expect(await classifyImage(image, options)).toEqual(good.output_parsed);
    const request = parse.mock.calls[0][0];
    expect(request.model).toBe("test-model");
    expect(request.input[0].content[1]).toMatchObject({ type: "input_image", detail: "auto" });
    expect(request.input[0].content[1].image_url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("treats a refusal as image_rejected without retrying", async () => {
    parse.mockResolvedValue(refusal);
    expect(await codeOf(classifyImage(image, options))).toBe("image_rejected");
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("retries once after malformed output and then succeeds", async () => {
    parse.mockResolvedValueOnce(malformed).mockResolvedValueOnce(good);
    expect(await classifyImage(image, options)).toEqual(good.output_parsed);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("fails with model_error when the output is malformed twice", async () => {
    parse.mockResolvedValue(malformed);
    expect(await codeOf(classifyImage(image, options))).toBe("model_error");
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("maps a timeout to timeout without retrying", async () => {
    parse.mockRejectedValue(new OpenAI.APIConnectionTimeoutError());
    expect(await codeOf(classifyImage(image, options))).toBe("timeout");
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("retries once on a 429 and then succeeds", async () => {
    parse.mockRejectedValueOnce(rateLimitError()).mockResolvedValueOnce(good);
    expect(await classifyImage(image, options)).toEqual(good.output_parsed);
  });

  it("fails with model_error after two 5xx responses", async () => {
    parse.mockRejectedValue(serverError());
    expect(await codeOf(classifyImage(image, options))).toBe("model_error");
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("maps an invalid-image 400 to image_rejected without retrying", async () => {
    const rejected = new OpenAI.BadRequestError(400, { code: "invalid_image_format" }, "bad image", new Headers());
    parse.mockRejectedValue(rejected);
    expect(await codeOf(classifyImage(image, options))).toBe("image_rejected");
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("never logs image data", async () => {
    parse.mockRejectedValue(serverError());
    await classifyImage(image, options).catch(() => {});
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("base64");
  });
});
