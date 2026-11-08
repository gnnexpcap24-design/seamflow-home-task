import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit then blocks with a retry time", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(check("ip", 0)).toEqual({ allowed: true });
    expect(check("ip", 1000)).toEqual({ allowed: true });
    expect(check("ip", 2000)).toEqual({ allowed: false, retryAfterSeconds: 58 });
  });

  it("allows again after the window passes", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 1000 });
    check("ip", 0);
    expect(check("ip", 500).allowed).toBe(false);
    expect(check("ip", 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 1000 });
    check("a", 0);
    expect(check("b", 0).allowed).toBe(true);
  });
});
