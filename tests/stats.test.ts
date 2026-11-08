import { describe, expect, it } from "vitest";
import { buildStats, fillDays, summarizeDays, type RawStats } from "@/lib/scans/stats";

const TODAY = new Date("2026-11-08T15:00:00Z");

function raw(overrides: Partial<RawStats> = {}): RawStats {
  return { total: 10, hot_dogs: 4, avg_confidence: 0.9123456, low_confidence: 2, flagged: 1, per_day: [], ...overrides };
}

describe("fillDays", () => {
  it("returns 14 consecutive days ending today with zeros for missing days", () => {
    const days = fillDays([{ day: "2026-11-07", hot_dogs: 2, not_hot_dogs: 4 }], TODAY);
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-10-26");
    expect(days[13].date).toBe("2026-11-08");
    expect(days[13]).toEqual({ date: "2026-11-08", hotDogs: 0, notHotDogs: 0 });
    expect(days[12]).toEqual({ date: "2026-11-07", hotDogs: 2, notHotDogs: 4 });
  });

  it("ignores rows outside the window", () => {
    const days = fillDays([{ day: "2026-01-01", hot_dogs: 9, not_hot_dogs: 9 }], TODAY);
    expect(days.every((day) => day.hotDogs === 0 && day.notHotDogs === 0)).toBe(true);
  });
});

describe("buildStats", () => {
  it("computes counts, rate and rounded average", () => {
    const stats = buildStats(raw(), TODAY);
    expect(stats).toMatchObject({ total: 10, hotDogs: 4, notHotDogs: 6, hotDogRate: 0.4, avgConfidence: 0.9123, lowConfidence: 2, flagged: 1 });
  });

  it("handles an account with no scans", () => {
    const stats = buildStats(raw({ total: 0, hot_dogs: 0, avg_confidence: null, low_confidence: 0, flagged: 0 }), TODAY);
    expect(stats).toMatchObject({ total: 0, hotDogRate: 0, avgConfidence: 0, notHotDogs: 0 });
    expect(stats.perDay).toHaveLength(14);
  });
});

describe("summarizeDays", () => {
  it("adds up the days shown in the chart", () => {
    const days = fillDays(
      [
        { day: "2026-11-07", hot_dogs: 2, not_hot_dogs: 4 },
        { day: "2026-11-08", hot_dogs: 1, not_hot_dogs: 0 },
      ],
      TODAY,
    );
    expect(summarizeDays(days)).toEqual({ total: 7, hotDogs: 3 });
  });
});
