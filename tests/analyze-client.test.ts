import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, requestAnalysis } from "@/lib/analyze/client";

const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
const okBody = { verdict: "hot_dog", confidence: 0.9, reason: "ok", lowConfidence: false, analyzedAt: "t", saved: false, quota: null };

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("requestAnalysis", () => {
  it("posts the file as multipart form data and returns the result", async () => {
    const fetchMock = mockFetch(Response.json(okBody));
    expect(await requestAnalysis(file)).toEqual(okBody);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/analyze");
    const form = init?.body as FormData;
    expect(form.get("file")).toBeInstanceOf(File);
    expect(form.has("batchId")).toBe(false);
  });

  it("adds the batchId field when given", async () => {
    const fetchMock = mockFetch(Response.json(okBody));
    await requestAnalysis(file, "5d1f6c1e-5c0a-4a52-9d58-3c5d2f8e7a10");
    const init = fetchMock.mock.calls[0][1];
    expect((init?.body as FormData).get("batchId")).toBe("5d1f6c1e-5c0a-4a52-9d58-3c5d2f8e7a10");
  });

  it("throws an ApiRequestError with the code, message, upgrade target and Retry-After", async () => {
    mockFetch(
      Response.json(
        { error: { code: "quota_exceeded", message: "Used up", upgradeTo: "pro" } },
        { status: 403, headers: { "Retry-After": "12" } },
      ),
    );
    const error = await requestAnalysis(file).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: "quota_exceeded", message: "Used up", upgradeTo: "pro", retryAfterSeconds: 12 });
  });

  it("falls back to a friendly message when the error body is not JSON", async () => {
    mockFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    const error = await requestAnalysis(file).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.message).toContain("unavailable");
    expect(error.retryAfterSeconds).toBeUndefined();
  });
});
