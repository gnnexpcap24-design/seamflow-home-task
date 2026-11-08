import { describe, expect, it } from "vitest";
import { scaleToFit } from "@/lib/image/compress";

describe("scaleToFit", () => {
  it("scales the longest side down to the maximum", () => {
    expect(scaleToFit(3000, 1500, 1500)).toEqual({ width: 1500, height: 750 });
    expect(scaleToFit(1000, 4000, 1500)).toEqual({ width: 375, height: 1500 });
  });

  it("never scales up", () => {
    expect(scaleToFit(800, 600, 1500)).toEqual({ width: 800, height: 600 });
  });
});
