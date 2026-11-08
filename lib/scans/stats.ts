import { INSIGHTS_DAYS, type DayCount, type Stats } from "@/lib/scans/shared";

export type RawStats = {
  total: number;
  hot_dogs: number;
  avg_confidence: number | null;
  low_confidence: number;
  flagged: number;
  per_day: { day: string; hot_dogs: number; not_hot_dogs: number }[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function round(value: number): number {
  return Number(value.toFixed(4));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The last `days` UTC dates ending today, with zero counts for days that have no scans.
export function fillDays(perDay: RawStats["per_day"], today: Date, days = INSIGHTS_DAYS): DayCount[] {
  const byDay = new Map(perDay.map((entry) => [entry.day, entry]));
  return Array.from({ length: days }, (_, index) => {
    const date = isoDay(new Date(today.getTime() - (days - 1 - index) * MS_PER_DAY));
    const entry = byDay.get(date);
    return { date, hotDogs: entry?.hot_dogs ?? 0, notHotDogs: entry?.not_hot_dogs ?? 0 };
  });
}

export function buildStats(raw: RawStats, today = new Date()): Stats {
  return {
    total: raw.total,
    hotDogs: raw.hot_dogs,
    notHotDogs: raw.total - raw.hot_dogs,
    hotDogRate: raw.total === 0 ? 0 : round(raw.hot_dogs / raw.total),
    avgConfidence: round(raw.avg_confidence ?? 0),
    lowConfidence: raw.low_confidence,
    flagged: raw.flagged,
    perDay: fillDays(raw.per_day, today),
  };
}

// Totals for the days shown in the chart, used for the text summary under it.
export function summarizeDays(perDay: DayCount[]): { total: number; hotDogs: number } {
  const hotDogs = perDay.reduce((sum, day) => sum + day.hotDogs, 0);
  const notHotDogs = perDay.reduce((sum, day) => sum + day.notHotDogs, 0);
  return { total: hotDogs + notHotDogs, hotDogs };
}
