import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "@/lib/auth/identity";

const saveScan = vi.hoisted(() => vi.fn());
vi.mock("@/lib/scans/repository", () => ({ saveScan }));

import { saveScanIfEligible } from "@/lib/scans/save";

const file = { fileName: "../lunch.jpg", buffer: Buffer.from("image-bytes"), mimeType: "image/jpeg" };
const analysis = { verdict: "hot_dog" as const, confidence: 0.9, reason: "ok" };
const pro: Identity = { kind: "user", plan: "pro", userId: "u-pro", email: null };
const free: Identity = { kind: "user", plan: "free", userId: "u-free", email: null };
const visitor: Identity = { kind: "visitor", plan: "visitor", visitorId: "v-1", isNewVisitor: false };

describe("saveScanIfEligible", () => {
  beforeEach(() => {
    saveScan.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("saves a Pro scan with a sanitized file name and returns its id", async () => {
    const result = await saveScanIfEligible(pro, file, analysis);
    expect(result.saved).toBe(true);
    expect(result.scanId).toEqual(expect.any(String));
    expect(saveScan).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-pro", fileName: "..lunch.jpg", scanId: result.scanId }));
  });

  it("passes the batch id through to storage", async () => {
    await saveScanIfEligible(pro, file, analysis, "11111111-2222-4333-8444-555555555555");
    expect(saveScan).toHaveBeenCalledWith(expect.objectContaining({ batchId: "11111111-2222-4333-8444-555555555555" }));
  });

  it.each([
    ["a free account", free],
    ["a visitor", visitor],
  ])("never stores a scan for %s", async (_name, identity) => {
    expect(await saveScanIfEligible(identity, file, analysis)).toEqual({ saved: false });
    expect(saveScan).not.toHaveBeenCalled();
  });

  it("returns saved false when storage or the database fails, and logs no image data", async () => {
    saveScan.mockRejectedValue(new Error("Upload failed: storage down"));
    expect(await saveScanIfEligible(pro, file, analysis)).toEqual({ saved: false });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("image-bytes");
  });
});
