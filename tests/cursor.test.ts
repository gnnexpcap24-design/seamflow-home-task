import { describe, expect, it } from "vitest";
import { buildPage, decodeCursor, encodeCursor } from "@/lib/scans/cursor";

const ID = "5d1f6c1e-5c0a-4a52-9d58-3c5d2f8e7a10";
const TIMESTAMP = "2026-11-08T11:30:00.123456+00:00";

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    created_at: `2026-11-08T11:30:${String(59 - index).padStart(2, "0")}.123456+00:00`,
  }));
}

describe("cursor encoding", () => {
  it("round-trips a cursor and keeps microsecond precision", () => {
    const cursor = { createdAt: TIMESTAMP, id: ID };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ["not base64 json", "%%%"],
    ["valid base64 of text", Buffer.from("hello").toString("base64url")],
    ["a bad id", Buffer.from(JSON.stringify({ createdAt: TIMESTAMP, id: "nope" })).toString("base64url")],
    ["a bad timestamp", Buffer.from(JSON.stringify({ createdAt: "x),id.eq.1", id: ID })).toString("base64url")],
  ])("rejects %s", (_name, value) => {
    expect(decodeCursor(value)).toBeNull();
  });
});

describe("buildPage", () => {
  it("has no next cursor when there are no rows", () => {
    expect(buildPage([], 20)).toEqual({ page: [], nextCursor: null });
  });

  it("has no next cursor for exactly 20 rows", () => {
    const result = buildPage(rows(20), 20);
    expect(result.page).toHaveLength(20);
    expect(result.nextCursor).toBeNull();
  });

  it("returns 20 rows and a next cursor for 21 rows, pointing at the last row of the page", () => {
    const all = rows(21);
    const result = buildPage(all, 20);
    expect(result.page).toHaveLength(20);
    expect(decodeCursor(result.nextCursor as string)).toEqual({ createdAt: all[19].created_at, id: all[19].id });
  });
});
