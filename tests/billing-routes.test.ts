import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthUser = vi.hoisted(() => vi.fn());
const upgradeToPro = vi.hoisted(() => vi.fn());
const downgradeToFree = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/identity", () => ({ getAuthUser }));
vi.mock("@/lib/billing", () => ({ upgradeToPro, downgradeToFree }));

import { POST as downgrade } from "@/app/api/billing/downgrade/route";
import { POST as upgrade } from "@/app/api/billing/upgrade/route";

function upgradeRequest(body: unknown) {
  return new Request("http://localhost/api/billing/upgrade", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/billing/upgrade", () => {
  beforeEach(() => {
    getAuthUser.mockReset().mockResolvedValue({ id: "u-1", email: "a@b.co" });
    upgradeToPro.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 without a session", async () => {
    getAuthUser.mockResolvedValue(null);
    const response = await upgrade(upgradeRequest({ company: "Acme", billingEmail: "a@b.co" }));
    expect(response.status).toBe(401);
    expect(upgradeToPro).not.toHaveBeenCalled();
  });

  it("upgrades the signed-in user and trims the company", async () => {
    const response = await upgrade(upgradeRequest({ company: "  Acme  ", billingEmail: "billing@acme.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: "pro" });
    expect(upgradeToPro).toHaveBeenCalledWith("u-1", { company: "Acme", billingEmail: "billing@acme.com" });
  });

  it.each([
    ["a bad email", { company: "Acme", billingEmail: "not-an-email" }],
    ["a missing company", { company: "  ", billingEmail: "a@b.co" }],
    ["a missing body", {}],
  ])("returns 400 invalid_request for %s", async (_name, body) => {
    const response = await upgrade(upgradeRequest(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(upgradeToPro).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not JSON", async () => {
    expect((await upgrade(upgradeRequest("not json"))).status).toBe(400);
  });

  it("returns 500 when the database update fails", async () => {
    upgradeToPro.mockRejectedValue(new Error("db down"));
    const response = await upgrade(upgradeRequest({ company: "Acme", billingEmail: "a@b.co" }));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/billing/downgrade", () => {
  beforeEach(() => {
    getAuthUser.mockReset().mockResolvedValue({ id: "u-1", email: null });
    downgradeToFree.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 without a session", async () => {
    getAuthUser.mockResolvedValue(null);
    expect((await downgrade()).status).toBe(401);
  });

  it("sets the plan back to free", async () => {
    const response = await downgrade();
    expect(await response.json()).toEqual({ plan: "free" });
    expect(downgradeToFree).toHaveBeenCalledWith("u-1");
  });
});
