import { describe, expect, it } from "vitest";
import { PLANS, buildQuota, quotaLabel, upgradeTarget } from "@/lib/plans";

describe("PLANS", () => {
  it("has the agreed limits and features", () => {
    expect(PLANS.visitor).toEqual({ scanLimit: 3, history: false, batch: false, insights: false });
    expect(PLANS.free).toEqual({ scanLimit: 5, history: false, batch: false, insights: false });
    expect(PLANS.pro).toEqual({ scanLimit: null, history: true, batch: true, insights: true });
  });
});

describe("buildQuota", () => {
  it("computes remaining for limited plans and never goes negative", () => {
    expect(buildQuota("visitor", 1)).toEqual({ plan: "visitor", used: 1, limit: 3, remaining: 2 });
    expect(buildQuota("free", 9)).toEqual({ plan: "free", used: 9, limit: 5, remaining: 0 });
  });

  it("has no limit or remaining for pro", () => {
    expect(buildQuota("pro", 120)).toEqual({ plan: "pro", used: 120, limit: null, remaining: null });
  });
});

describe("upgradeTarget", () => {
  it("sends visitors to an account, free users to pro, and pro to nothing", () => {
    expect(upgradeTarget("visitor")).toBe("account");
    expect(upgradeTarget("free")).toBe("pro");
    expect(upgradeTarget("pro")).toBeNull();
  });
});

describe("quotaLabel", () => {
  it("describes each plan", () => {
    expect(quotaLabel(buildQuota("visitor", 0))).toBe("3 free scans left");
    expect(quotaLabel(buildQuota("visitor", 2))).toBe("1 free scan left");
    expect(quotaLabel(buildQuota("free", 0))).toBe("5 scans left");
    expect(quotaLabel(buildQuota("pro", 40))).toBe("Pro · unlimited");
  });
});
