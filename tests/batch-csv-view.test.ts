import { describe, expect, it } from "vitest";
import { buildCsv, csvFileName, escapeCell } from "@/lib/batch/csv";
import type { BatchItem } from "@/lib/batch/queue";
import { filterAndSort } from "@/lib/batch/view";

function item(name: string, overrides: Partial<BatchItem> = {}): BatchItem {
  return { id: name, file: new File(["x"], name, { type: "image/jpeg" }), status: "queued", ...overrides };
}

function done(name: string, verdict: "hot_dog" | "not_hot_dog", confidence: number, reason = "ok"): BatchItem {
  return item(name, {
    status: "done",
    result: { verdict, confidence, reason, lowConfidence: confidence < 0.7, analyzedAt: "2026-11-08T11:30:00.000Z" },
  });
}

describe("escapeCell", () => {
  it("leaves plain text alone", () => {
    expect(escapeCell("lunch.jpg")).toBe("lunch.jpg");
  });

  it("quotes cells with commas, quotes and newlines, doubling inner quotes", () => {
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it.each(["=SUM(1+1).jpg", "+1", "-1", "@cmd", "\tcmd", "\rcmd"])("defuses a formula-like cell starting with %j", (value) => {
    expect(escapeCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("prefixes and still quotes when both apply", () => {
    expect(escapeCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });
});

describe("buildCsv", () => {
  it("starts with a BOM and the header in the agreed column order, with CRLF line endings", () => {
    const csv = buildCsv([]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿file_name,verdict,confidence,reason,status,analyzed_at\r\n");
  });

  it("writes finished items and failed items with the error code as the reason", () => {
    const failed = item("bad.jpg", { status: "failed", error: { code: "unsupported_type", message: "Not an image" } });
    const csv = buildCsv([done("a.jpg", "hot_dog", 0.94, "Sausage, in a bun"), failed]);
    expect(csv.split("\r\n")).toEqual([
      "﻿file_name,verdict,confidence,reason,status,analyzed_at",
      'a.jpg,hot_dog,0.94,"Sausage, in a bun",done,2026-11-08T11:30:00.000Z',
      "bad.jpg,,,unsupported_type,failed,",
      "",
    ]);
  });

  it("leaves out items that never finished", () => {
    const csv = buildCsv([item("queued.jpg"), item("busy.jpg", { status: "analyzing" }), item("c.jpg", { status: "canceled" })]);
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("escapes a file named =SUM(1+1).jpg", () => {
    const csv = buildCsv([done("=SUM(1+1).jpg", "hot_dog", 0.9)]);
    expect(csv).toContain("\r\n'=SUM(1+1).jpg,hot_dog,");
    expect(csv).not.toContain("\r\n=SUM");
  });

  it("sanitizes path characters in file names", () => {
    expect(buildCsv([done("../evil.jpg", "hot_dog", 0.9)])).toContain("\r\n..evil.jpg,");
  });
});

describe("csvFileName", () => {
  it("uses the date", () => {
    expect(csvFileName(new Date("2026-11-08T23:30:00Z"))).toBe("hot-dog-or-not-results-2026-11-08.csv");
  });
});

describe("filterAndSort", () => {
  const items = [
    done("a.jpg", "hot_dog", 0.5),
    done("b.jpg", "not_hot_dog", 0.9),
    item("c.jpg", { status: "failed", error: { code: "x", message: "x" } }),
    item("d.jpg"),
    done("e.jpg", "hot_dog", 0.8),
  ];
  const all = { verdict: "all", status: "all", sort: "none" } as const;

  it("returns everything in order with no filters", () => {
    expect(filterAndSort(items, all).map((i) => i.id)).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"]);
  });

  it("filters by verdict", () => {
    expect(filterAndSort(items, { ...all, verdict: "hot_dog" }).map((i) => i.id)).toEqual(["a.jpg", "e.jpg"]);
  });

  it("filters by status, treating queued items as pending", () => {
    expect(filterAndSort(items, { ...all, status: "failed" }).map((i) => i.id)).toEqual(["c.jpg"]);
    expect(filterAndSort(items, { ...all, status: "pending" }).map((i) => i.id)).toEqual(["d.jpg"]);
    expect(filterAndSort(items, { ...all, status: "done" })).toHaveLength(3);
  });

  it("sorts by confidence with unfinished and failed items last", () => {
    expect(filterAndSort(items, { ...all, sort: "high" }).map((i) => i.id)).toEqual(["b.jpg", "e.jpg", "a.jpg", "c.jpg", "d.jpg"]);
    expect(filterAndSort(items, { ...all, sort: "low" }).map((i) => i.id)).toEqual(["a.jpg", "e.jpg", "b.jpg", "c.jpg", "d.jpg"]);
  });

  it("does not change the original list", () => {
    const before = items.map((i) => i.id);
    filterAndSort(items, { ...all, sort: "high" });
    expect(items.map((i) => i.id)).toEqual(before);
  });
});
