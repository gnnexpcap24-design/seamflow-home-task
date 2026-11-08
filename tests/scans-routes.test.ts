import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePlan = vi.hoisted(() => vi.fn());
const listScans = vi.hoisted(() => vi.fn());
const deleteScan = vi.hoisted(() => vi.fn());
const toggleFlag = vi.hoisted(() => vi.fn());
const getStats = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/require-plan", () => ({ requirePlan }));
vi.mock("@/lib/scans/repository", () => ({ listScans, deleteScan, toggleFlag, getStats }));

import { DELETE } from "@/app/api/scans/[id]/route";
import { POST as flag } from "@/app/api/scans/[id]/flag/route";
import { GET as stats } from "@/app/api/stats/route";
import { GET as list } from "@/app/api/scans/route";
import { encodeCursor } from "@/lib/scans/cursor";

const ID = "5d1f6c1e-5c0a-4a52-9d58-3c5d2f8e7a10";
const owner = { identity: { kind: "user", plan: "pro", userId: "owner-1", email: null } };
const context = (id = ID) => ({ params: Promise.resolve({ id }) });
const get = (query = "") => list(new Request(`http://localhost/api/scans${query}`));
const noSession = { response: NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 }) };
const notPro = { response: NextResponse.json({ error: { code: "pro_required" } }, { status: 403 }) };

beforeEach(() => {
  requirePlan.mockReset().mockResolvedValue(owner);
  listScans.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  deleteScan.mockReset().mockResolvedValue(true);
  toggleFlag.mockReset().mockResolvedValue(true);
  getStats.mockReset().mockResolvedValue({ total: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/scans", () => {
  it("401 without a session and 403 for a non-Pro user, without touching the database", async () => {
    requirePlan.mockResolvedValue(noSession);
    expect((await get()).status).toBe(401);
    requirePlan.mockResolvedValue(notPro);
    expect((await get()).status).toBe(403);
    expect(listScans).not.toHaveBeenCalled();
  });

  it("uses the signed-in user's id, never an id from the request", async () => {
    await get(`?userId=someone-else&user_id=someone-else`);
    expect(listScans).toHaveBeenCalledWith("owner-1", expect.objectContaining({ limit: 20 }));
  });

  it("caps the limit at 50 and passes the verdict filter and cursor", async () => {
    const cursor = encodeCursor({ createdAt: "2026-11-08T11:30:00.123456+00:00", id: ID });
    await get(`?limit=500&verdict=hot_dog&cursor=${cursor}`);
    expect(listScans).toHaveBeenCalledWith("owner-1", {
      limit: 50,
      verdict: "hot_dog",
      cursor: { createdAt: "2026-11-08T11:30:00.123456+00:00", id: ID },
    });
  });

  it.each(["?limit=0", "?limit=abc", "?verdict=pizza", "?cursor=garbage"])("400 for %s", async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(listScans).not.toHaveBeenCalled();
  });

  it("returns the page", async () => {
    listScans.mockResolvedValue({ items: [{ id: ID, thumbUrl: null }], nextCursor: "abc" });
    expect(await (await get()).json()).toEqual({ items: [{ id: ID, thumbUrl: null }], nextCursor: "abc" });
  });

  it("500 when the database fails", async () => {
    listScans.mockRejectedValue(new Error("db down"));
    expect((await get()).status).toBe(500);
  });
});

describe("DELETE /api/scans/:id", () => {
  const remove = (id?: string) => DELETE(new Request("http://localhost"), context(id));

  it("401 and 403 are returned before anything is deleted", async () => {
    requirePlan.mockResolvedValue(noSession);
    expect((await remove()).status).toBe(401);
    requirePlan.mockResolvedValue(notPro);
    expect((await remove()).status).toBe(403);
    expect(deleteScan).not.toHaveBeenCalled();
  });

  it("400 for an id that is not a uuid", async () => {
    expect((await remove("not-a-uuid")).status).toBe(400);
    expect(deleteScan).not.toHaveBeenCalled();
  });

  it("404 when the scan is not the user's (same as a missing scan)", async () => {
    deleteScan.mockResolvedValue(false);
    const response = await remove();
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("204 for the owner, deleting by the signed-in user's id", async () => {
    const response = await remove();
    expect(response.status).toBe(204);
    expect(deleteScan).toHaveBeenCalledWith("owner-1", ID);
  });

  it("500 when deletion fails", async () => {
    deleteScan.mockRejectedValue(new Error("storage down"));
    expect((await remove()).status).toBe(500);
  });
});

describe("POST /api/scans/:id/flag", () => {
  const toggle = (id?: string) => flag(new Request("http://localhost", { method: "POST" }), context(id));

  it("returns the new flag value for the owner", async () => {
    toggleFlag.mockResolvedValue(false);
    expect(await (await toggle()).json()).toEqual({ flagged: false });
    expect(toggleFlag).toHaveBeenCalledWith("owner-1", ID);
  });

  it("404 for someone else's scan and 400 for a bad id", async () => {
    toggleFlag.mockResolvedValue(null);
    expect((await toggle()).status).toBe(404);
    expect((await toggle("nope")).status).toBe(400);
  });

  it("403 for a non-Pro user", async () => {
    requirePlan.mockResolvedValue(notPro);
    expect((await toggle()).status).toBe(403);
    expect(toggleFlag).not.toHaveBeenCalled();
  });
});

describe("GET /api/stats", () => {
  it("returns stats for the signed-in Pro user", async () => {
    getStats.mockResolvedValue({ total: 7 });
    expect(await (await stats()).json()).toEqual({ total: 7 });
    expect(getStats).toHaveBeenCalledWith("owner-1");
  });

  it("403 for a non-Pro user", async () => {
    requirePlan.mockResolvedValue(notPro);
    expect((await stats()).status).toBe(403);
    expect(getStats).not.toHaveBeenCalled();
  });
});
