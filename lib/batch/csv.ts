import type { BatchItem } from "@/lib/batch/queue";
import { sanitizeFileName } from "@/lib/scans/sanitize";

export const CSV_COLUMNS = ["file_name", "verdict", "confidence", "reason", "status", "analyzed_at"] as const;

const BOM = "﻿"; // Lets Excel read non-English file names correctly.
const LINE_END = "\r\n"; // RFC 4180
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

// Spreadsheets run cells that start with = + - @ as formulas. File names come from users, so defuse them.
export function escapeCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toRow(item: BatchItem): string[] | null {
  const name = sanitizeFileName(item.file.name);
  if (item.status === "done" && item.result) {
    const { verdict, confidence, reason, analyzedAt } = item.result;
    return [name, verdict, String(confidence), reason, "done", analyzedAt];
  }
  if (item.status === "failed") return [name, "", "", item.error?.code ?? "unknown", "failed", ""];
  return null; // Items that never finished are not exported.
}

export function buildCsv(items: readonly BatchItem[]): string {
  const rows = items.map(toRow).filter((row): row is string[] => row !== null);
  const lines = [CSV_COLUMNS as readonly string[], ...rows].map((row) => row.map(escapeCell).join(","));
  return BOM + lines.join(LINE_END) + LINE_END;
}

export function csvFileName(now = new Date()): string {
  return `hot-dog-or-not-results-${now.toISOString().slice(0, 10)}.csv`;
}
