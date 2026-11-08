import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthUser = vi.hoisted(() => vi.fn());
const resolveIdentity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/identity", () => ({ getAuthUser, resolveIdentity }));

import { planGate, requirePlan } from "@/lib/auth/require-plan";

describe("requirePlan('pro')", () => {
  beforeEach(() => {
    getAuthUser.mockReset();
    resolveIdentity.mockReset();
  });

  it("returns 401 without a session", async () => {
    getAuthUser.mockResolvedValue(null);
    const result = await requirePlan("pro");
    expect("response" in result && result.response.status).toBe(401);
  });

  it("returns 403 pro_required for a free user", async () => {
    getAuthUser.mockResolvedValue({ id: "u-1", email: null });
    resolveIdentity.mockResolvedValue({ kind: "user", plan: "free", userId: "u-1", email: null });
    const result = await requirePlan("pro");
    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
      expect((await result.response.json()).error.code).toBe("pro_required");
    }
  });

  it("lets a pro user through", async () => {
    getAuthUser.mockResolvedValue({ id: "u-2", email: null });
    resolveIdentity.mockResolvedValue({ kind: "user", plan: "pro", userId: "u-2", email: null });
    const result = await requirePlan("pro");
    expect("identity" in result && result.identity.userId).toBe("u-2");
  });
});

describe("planGate", () => {
  it("is 401 for a visitor, 403 for a free user, and null for pro", async () => {
    const visitor = planGate({ kind: "visitor", plan: "visitor", visitorId: "v", isNewVisitor: false }, "pro");
    const free = planGate({ kind: "user", plan: "free", userId: "u", email: null }, "pro");
    expect(visitor?.status).toBe(401);
    expect(free?.status).toBe(403);
    expect((await free?.json())?.error.code).toBe("pro_required");
    expect(planGate({ kind: "user", plan: "pro", userId: "u", email: null }, "pro")).toBeNull();
  });
});
