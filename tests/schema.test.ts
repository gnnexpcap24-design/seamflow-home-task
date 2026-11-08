import { describe, expect, it } from "vitest";
import { AnalysisSchema } from "@/lib/analyze/schema";

const valid = { verdict: "hot_dog", confidence: 0.94, reason: "Sausage in a bun." };

describe("AnalysisSchema", () => {
  it("accepts valid output", () => {
    expect(AnalysisSchema.safeParse(valid).success).toBe(true);
    expect(AnalysisSchema.safeParse({ ...valid, verdict: "not_hot_dog" }).success).toBe(true);
  });

  it("rejects an unknown verdict", () => {
    expect(AnalysisSchema.safeParse({ ...valid, verdict: "maybe" }).success).toBe(false);
  });

  it("rejects confidence outside 0 to 1", () => {
    expect(AnalysisSchema.safeParse({ ...valid, confidence: 1.2 }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
  });

  it("rejects a reason longer than 200 characters", () => {
    expect(AnalysisSchema.safeParse({ ...valid, reason: "a".repeat(201) }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(AnalysisSchema.safeParse({ verdict: "hot_dog" }).success).toBe(false);
  });
});
