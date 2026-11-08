import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "@/lib/auth/identity";

const rpc = vi.hoisted(() => vi.fn());
const single = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ rpc, from }) }));

import { consumeScan, getQuota, refundScan } from "@/lib/quota";

const visitor: Identity = { kind: "visitor", plan: "visitor", visitorId: "v-1", isNewVisitor: false };
const free: Identity = { kind: "user", plan: "free", userId: "u-1", email: null };
const pro: Identity = { kind: "user", plan: "pro", userId: "u-2", email: null };

describe("consumeScan", () => {
  beforeEach(() => rpc.mockReset());

  it("allows a visitor under the limit", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await consumeScan(visitor)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_visitor_scan", { p_visitor: "v-1", p_limit: 3 });
  });

  it("blocks a visitor at the limit", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await consumeScan(visitor)).toBe(false);
  });

  it("blocks a free account at its limit of 5", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await consumeScan(free)).toBe(false);
    expect(rpc).toHaveBeenCalledWith("consume_user_scan", { p_user: "u-1", p_limit: 5 });
  });

  it("passes no limit for pro", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await consumeScan(pro)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_user_scan", { p_user: "u-2", p_limit: null });
  });

  it("throws when the database call fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(consumeScan(free)).rejects.toThrow("Could not consume scan");
  });
});

describe("refundScan", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refunds a visitor or a user by id", async () => {
    rpc.mockResolvedValue({ error: null });
    await refundScan(visitor);
    await refundScan(free);
    expect(rpc).toHaveBeenNthCalledWith(1, "refund_scan", { p_visitor: "v-1", p_user: null });
    expect(rpc).toHaveBeenNthCalledWith(2, "refund_scan", { p_visitor: null, p_user: "u-1" });
  });

  it("never throws when the refund fails", async () => {
    rpc.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    await expect(refundScan(free)).resolves.toBeUndefined();
  });
});

describe("getQuota", () => {
  beforeEach(() => {
    single.mockReset();
    maybeSingle.mockReset();
    from.mockReset().mockReturnValue({ select: () => ({ eq: () => ({ single, maybeSingle }) }) });
  });

  it("reads a user's usage from profiles", async () => {
    single.mockResolvedValue({ data: { scans_used: 2 }, error: null });
    expect(await getQuota(free)).toEqual({ plan: "free", used: 2, limit: 5, remaining: 3 });
    expect(from).toHaveBeenCalledWith("profiles");
  });

  it("treats a visitor without a row as zero scans", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getQuota(visitor)).toEqual({ plan: "visitor", used: 0, limit: 3, remaining: 3 });
    expect(from).toHaveBeenCalledWith("visitor_usage");
  });

  it("has no remaining for pro", async () => {
    single.mockResolvedValue({ data: { scans_used: 50 }, error: null });
    expect((await getQuota(pro)).remaining).toBeNull();
  });
});
