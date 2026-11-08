import { describe, expect, it } from "vitest";
import { formatDay, formatPercent, formatRelativeTime } from "@/lib/format";
import { sanitizeFileName } from "@/lib/scans/sanitize";

describe("sanitizeFileName", () => {
  it("keeps a normal name", () => {
    expect(sanitizeFileName("lunch photo.jpg")).toBe("lunch photo.jpg");
  });

  it("strips path characters and control characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("....etcpasswd");
    expect(sanitizeFileName("a\\b\u0000c\nd.jpg")).toBe("abcd.jpg");
  });

  it("limits the length and falls back for empty names", () => {
    expect(sanitizeFileName("a".repeat(500))).toHaveLength(100);
    expect(sanitizeFileName("  /  ")).toBe("image");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-11-08T12:00:00Z").getTime();

  it("describes recent and older scans", () => {
    expect(formatRelativeTime("2026-11-08T11:59:40Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-11-08T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-11-08T10:00:00Z", now)).toBe("2 hours ago");
    expect(formatRelativeTime("2026-11-07T12:00:00Z", now)).toBe("yesterday");
    expect(formatRelativeTime("2026-11-01T12:00:00Z", now)).toBe("7 days ago");
  });
});

describe("formatDay and formatPercent", () => {
  it("formats UTC days", () => {
    expect(formatDay("2026-11-07")).toBe("Nov 7");
    expect(formatDay("2026-11-07", "long")).toBe("Nov 7, 2026");
  });

  it("formats a fraction as a whole percent", () => {
    expect(formatPercent(0.9123)).toBe("91%");
    expect(formatPercent(0)).toBe("0%");
  });
});
