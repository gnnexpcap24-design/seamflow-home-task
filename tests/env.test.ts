import { afterEach, describe, expect, it } from "vitest";
import { requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  afterEach(() => {
    delete process.env.TEST_VAR;
  });

  it("returns the value when set", () => {
    process.env.TEST_VAR = "abc";
    expect(requireEnv("TEST_VAR")).toBe("abc");
  });

  it("throws a clear error when missing", () => {
    expect(() => requireEnv("TEST_VAR")).toThrow("Missing environment variable: TEST_VAR");
  });
});
