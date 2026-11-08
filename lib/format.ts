const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit);
  }
  return "just now";
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// "2026-11-07" -> "Nov 7". Dates are UTC days, so they are formatted in UTC.
export function formatDay(isoDay: string, style: "short" | "long" = "short"): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}
