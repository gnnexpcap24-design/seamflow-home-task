import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthUser = vi.hoisted(() => vi.fn());
const resolveIdentity = vi.hoisted(() => vi.fn());
const getQuota = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/identity", () => ({ getAuthUser, resolveIdentity }));
vi.mock("@/lib/quota", () => ({ getQuota }));

import { GET } from "@/app/api/me/route";

describe("GET /api/me", () => {
  beforeEach(() => {
    getAuthUser.mockReset();
    resolveIdentity.mockReset();
    getQuota.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reports a visitor as not authenticated", async () => {
    const quota = { plan: "visitor", used: 1, limit: 3, remaining: 2 };
    getAuthUser.mockResolvedValue(null);
    resolveIdentity.mockResolvedValue({ kind: "visitor", plan: "visitor", visitorId: "v", isNewVisitor: true });
    getQuota.mockResolvedValue(quota);
    expect(await (await GET()).json()).toEqual({ authenticated: false, plan: "visitor", quota });
  });

  it("reports a signed-in user", async () => {
    const quota = { plan: "free", used: 0, limit: 5, remaining: 5 };
    getAuthUser.mockResolvedValue({ id: "u-1", email: null });
    resolveIdentity.mockResolvedValue({ kind: "user", plan: "free", userId: "u-1", email: null });
    getQuota.mockResolvedValue(quota);
    expect(await (await GET()).json()).toEqual({ authenticated: true, plan: "free", quota });
  });

  it("returns 500 when the database fails", async () => {
    getAuthUser.mockResolvedValue(null);
    resolveIdentity.mockRejectedValue(new Error("db down"));
    expect((await GET()).status).toBe(500);
  });
});
