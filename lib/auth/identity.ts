import type { NextResponse } from "next/server";
import { readVisitorId, setVisitorCookie } from "@/lib/auth/visitor";
import type { UserPlan } from "@/lib/plans";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

export type AuthUser = { id: string; email: string | null };

export type UserIdentity = { kind: "user"; plan: UserPlan; userId: string; email: string | null };
export type VisitorIdentity = { kind: "visitor"; plan: "visitor"; visitorId: string; isNewVisitor: boolean };
export type Identity = UserIdentity | VisitorIdentity;

// Uses getUser(), which asks Supabase Auth to verify the session, never getSession().
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

async function loadPlan(userId: string): Promise<UserPlan> {
  const { data, error } = await getAdminClient().from("profiles").select("plan").eq("id", userId).single();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  return data.plan === "pro" ? "pro" : "free";
}

// Plan and quota always come from the database, never from the client.
export async function resolveIdentity(user: AuthUser | null): Promise<Identity> {
  if (user) return { kind: "user", plan: await loadPlan(user.id), userId: user.id, email: user.email };
  const existing = await readVisitorId();
  return {
    kind: "visitor",
    plan: "visitor",
    visitorId: existing ?? crypto.randomUUID(),
    isNewVisitor: existing === null,
  };
}

// A new visitor only gets a cookie once they actually scan.
export function attachVisitorCookie(response: NextResponse, identity: Identity): NextResponse {
  if (identity.kind === "visitor" && identity.isNewVisitor) setVisitorCookie(response, identity.visitorId);
  return response;
}
