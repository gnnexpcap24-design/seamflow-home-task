import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error?: { message: string } | null };

const state = vi.hoisted(() => ({ queue: [] as Result[], maybeSingle: { data: null } as Result }));
const calls = vi.hoisted(() => ({ order: [] as string[] }));
const chain = vi.hoisted(() => ({} as Record<string, unknown>));
const upload = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const createSignedUrls = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

for (const method of ["select", "eq", "order", "limit", "or", "insert", "update", "delete", "lt", "in"]) {
  chain[method] = vi.fn((...args: unknown[]) => {
    calls.order.push(`${method}:${args.map(String).join(",")}`);
    return chain;
  });
}
chain.maybeSingle = vi.fn(async () => state.maybeSingle);
chain.then = (resolve: (value: Result) => unknown) => resolve(state.queue.shift() ?? { data: [], error: null });

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({ from: () => chain, rpc, storage: { from: () => ({ upload, remove, createSignedUrls }) } }),
}));

import { deleteScan, getStats, listScans, saveScan, toggleFlag } from "@/lib/scans/repository";

const USER = "user-1";
const ID = "5d1f6c1e-5c0a-4a52-9d58-3c5d2f8e7a10";

function row(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    file_name: `photo-${index}.jpg`,
    image_path: `${USER}/${index}.jpg`,
    verdict: "hot_dog",
    confidence: "0.91",
    reason: "Sausage in a bun.",
    flagged: false,
    created_at: `2026-11-08T11:30:${String(59 - index).padStart(2, "0")}.123456+00:00`,
  };
}

beforeEach(() => {
  state.queue = [];
  state.maybeSingle = { data: null };
  calls.order = [];
  upload.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  createSignedUrls.mockReset();
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("listScans", () => {
  it("scopes the query to the user and returns signed thumbnail URLs", async () => {
    state.queue = [{ data: [row(0), row(1)], error: null }];
    createSignedUrls.mockResolvedValue({
      data: [
        { path: `${USER}/0.jpg`, signedUrl: "https://signed/0", error: null },
        { path: `${USER}/1.jpg`, signedUrl: "https://signed/1", error: null },
      ],
      error: null,
    });
    const page = await listScans(USER, { limit: 20 });
    expect(calls.order).toContain(`eq:user_id,${USER}`);
    expect(page.items.map((item) => item.thumbUrl)).toEqual(["https://signed/0", "https://signed/1"]);
    expect(page.items[0]).toMatchObject({ fileName: "photo-0.jpg", confidence: 0.91 });
    expect(page.nextCursor).toBeNull();
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith([`${USER}/0.jpg`, `${USER}/1.jpg`], 3600);
  });

  it("sets thumbUrl to null for an item that cannot be signed", async () => {
    state.queue = [{ data: [row(0), row(1)], error: null }];
    createSignedUrls.mockResolvedValue({
      data: [
        { path: `${USER}/0.jpg`, signedUrl: "https://signed/0", error: null },
        { path: `${USER}/1.jpg`, signedUrl: null, error: "Object not found" },
      ],
      error: null,
    });
    const page = await listScans(USER, { limit: 20 });
    expect(page.items.map((item) => item.thumbUrl)).toEqual(["https://signed/0", null]);
  });

  it("sets every thumbUrl to null when signing fails entirely", async () => {
    state.queue = [{ data: [row(0)], error: null }];
    createSignedUrls.mockResolvedValue({ data: null, error: { message: "storage down" } });
    const page = await listScans(USER, { limit: 20 });
    expect(page.items[0].thumbUrl).toBeNull();
  });

  it("returns a next cursor when one extra row was fetched, and applies the verdict filter", async () => {
    state.queue = [{ data: [row(0), row(1), row(2)], error: null }];
    createSignedUrls.mockResolvedValue({ data: [], error: null });
    const page = await listScans(USER, { limit: 2, verdict: "not_hot_dog" });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    expect(calls.order).toContain("limit:3");
    expect(calls.order).toContain("eq:verdict,not_hot_dog");
  });

  it("applies the cursor as a keyset filter", async () => {
    state.queue = [{ data: [], error: null }];
    await listScans(USER, { limit: 20, cursor: { createdAt: row(5).created_at, id: row(5).id } });
    expect(calls.order.find((call) => call.startsWith("or:"))).toContain(`id.lt.${row(5).id}`);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("throws when the query fails", async () => {
    state.queue = [{ data: null, error: { message: "boom" } }];
    await expect(listScans(USER, { limit: 20 })).rejects.toThrow("Could not list scans");
  });
});

describe("saveScan", () => {
  const scan = {
    scanId: ID,
    userId: USER,
    fileName: "a.jpg",
    buffer: Buffer.from("x"),
    mimeType: "image/jpeg",
    analysis: { verdict: "hot_dog" as const, confidence: 0.9, reason: "ok" },
  };

  it("uploads to a server-built path, then inserts the row", async () => {
    await saveScan(scan);
    expect(upload).toHaveBeenCalledWith(`${USER}/${ID}.jpg`, scan.buffer, { contentType: "image/jpeg" });
    expect(calls.order.some((call) => call.startsWith("insert:"))).toBe(true);
  });

  it("does not insert when the upload fails", async () => {
    upload.mockResolvedValue({ error: { message: "storage down" } });
    await expect(saveScan(scan)).rejects.toThrow("Upload failed");
    expect(calls.order.some((call) => call.startsWith("insert:"))).toBe(false);
  });

  it("removes the uploaded file when the insert fails", async () => {
    state.queue = [{ error: { message: "db down" } }];
    await expect(saveScan(scan)).rejects.toThrow("Insert failed");
    expect(remove).toHaveBeenCalledWith([`${USER}/${ID}.jpg`]);
  });
});

describe("deleteScan", () => {
  it("returns false for a scan that is not the user's, and deletes nothing", async () => {
    state.maybeSingle = { data: null };
    expect(await deleteScan(USER, ID)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(calls.order.some((call) => call.startsWith("delete:"))).toBe(false);
    expect(calls.order).toContain(`eq:user_id,${USER}`);
  });

  it("removes the file and then the row for the owner", async () => {
    state.maybeSingle = { data: { id: ID, image_path: `${USER}/${ID}.jpg`, flagged: false } };
    state.queue = [{ error: null }];
    expect(await deleteScan(USER, ID)).toBe(true);
    expect(remove).toHaveBeenCalledWith([`${USER}/${ID}.jpg`]);
    expect(calls.order.some((call) => call.startsWith("delete:"))).toBe(true);
  });

  it("keeps the row when the file cannot be deleted", async () => {
    state.maybeSingle = { data: { id: ID, image_path: `${USER}/${ID}.jpg`, flagged: false } };
    remove.mockResolvedValue({ error: { message: "storage down" } });
    await expect(deleteScan(USER, ID)).rejects.toThrow("Could not delete image");
    expect(calls.order.some((call) => call.startsWith("delete:"))).toBe(false);
  });
});

describe("toggleFlag", () => {
  it("returns null for someone else's scan", async () => {
    expect(await toggleFlag(USER, ID)).toBeNull();
  });

  it("flips the flag for the owner", async () => {
    state.maybeSingle = { data: { id: ID, image_path: "p", flagged: false } };
    state.queue = [{ error: null }];
    expect(await toggleFlag(USER, ID)).toBe(true);
    state.maybeSingle = { data: { id: ID, image_path: "p", flagged: true } };
    state.queue = [{ error: null }];
    expect(await toggleFlag(USER, ID)).toBe(false);
  });
});

describe("getStats", () => {
  it("calls the aggregate function for the user and shapes the result", async () => {
    rpc.mockResolvedValue({
      data: { total: 4, hot_dogs: 1, avg_confidence: 0.8, low_confidence: 1, flagged: 0, per_day: [] },
      error: null,
    });
    const stats = await getStats(USER);
    expect(rpc).toHaveBeenCalledWith("scan_stats", { p_user: USER, p_days: 14, p_low_confidence: 0.7 });
    expect(stats).toMatchObject({ total: 4, hotDogs: 1, notHotDogs: 3, hotDogRate: 0.25 });
    expect(stats.perDay).toHaveLength(14);
  });

  it("throws when the function fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getStats(USER)).rejects.toThrow("Could not load stats");
  });
});
