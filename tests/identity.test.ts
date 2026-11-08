import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const cookieValue = vi.hoisted(() => ({ current: undefined as string | undefined }));
const getUser = vi.hoisted(() => vi.fn());
const single = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue.current ? { value: cookieValue.current } : undefined) }),
}));
vi.mock("@/lib/supabase/server", () => ({ getServerClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }),
}));

import { attachVisitorCookie, getAuthUser, resolveIdentity } from "@/lib/auth/identity";

const EXISTING_ID = "5d1f6c1e-5c0a-4a52-9d58-3c5d2f8e7a10";

describe("getAuthUser", () => {
  it("returns the verified user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1", email: "a@b.co" } }, error: null });
    expect(await getAuthUser()).toEqual({ id: "u-1", email: "a@b.co" });
  });

  it("returns null without a valid session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
    expect(await getAuthUser()).toBeNull();
  });
});

describe("resolveIdentity", () => {
  beforeEach(() => {
    cookieValue.current = undefined;
    single.mockReset();
  });

  it("loads the plan from the database for a signed-in user", async () => {
    single.mockResolvedValue({ data: { plan: "pro" }, error: null });
    expect(await resolveIdentity({ id: "u-1", email: null })).toMatchObject({ kind: "user", plan: "pro", userId: "u-1" });
  });

  it("throws when the profile cannot be loaded", async () => {
    single.mockResolvedValue({ data: null, error: { message: "missing" } });
    await expect(resolveIdentity({ id: "u-1", email: null })).rejects.toThrow("Could not load profile");
  });

  it("reuses a valid visitor cookie", async () => {
    cookieValue.current = EXISTING_ID;
    expect(await resolveIdentity(null)).toMatchObject({ kind: "visitor", visitorId: EXISTING_ID, isNewVisitor: false });
  });

  it("creates a new visitor id when the cookie is missing or not a uuid", async () => {
    const missing = await resolveIdentity(null);
    cookieValue.current = "not-a-uuid";
    const invalid = await resolveIdentity(null);
    expect(missing).toMatchObject({ isNewVisitor: true });
    expect(invalid).toMatchObject({ isNewVisitor: true });
    expect(invalid.kind === "visitor" && invalid.visitorId).not.toBe("not-a-uuid");
  });
});

describe("attachVisitorCookie", () => {
  it("sets an httpOnly cookie only for a new visitor", () => {
    const fresh = attachVisitorCookie(NextResponse.json({}), { kind: "visitor", plan: "visitor", visitorId: EXISTING_ID, isNewVisitor: true });
    const header = fresh.headers.get("set-cookie") ?? "";
    expect(header).toContain(`hdn_vid=${EXISTING_ID}`);
    expect(header).toContain("HttpOnly");
    expect(header.toLowerCase()).toContain("samesite=lax");

    const returning = attachVisitorCookie(NextResponse.json({}), { kind: "visitor", plan: "visitor", visitorId: EXISTING_ID, isNewVisitor: false });
    expect(returning.headers.get("set-cookie")).toBeNull();
  });
});
