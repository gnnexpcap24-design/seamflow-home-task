import type { Identity } from "@/lib/auth/identity";
import { PLANS, buildQuota, type Quota } from "@/lib/plans";
import { getAdminClient } from "@/lib/supabase/admin";

// Consumes one scan atomically in the database. Returns false when the plan limit is reached.
export async function consumeScan(identity: Identity): Promise<boolean> {
  const admin = getAdminClient();
  const limit = PLANS[identity.plan].scanLimit;
  const { data, error } =
    identity.kind === "user"
      ? await admin.rpc("consume_user_scan", { p_user: identity.userId, p_limit: limit })
      : await admin.rpc("consume_visitor_scan", { p_visitor: identity.visitorId, p_limit: limit });
  if (error) throw new Error(`Could not consume scan: ${error.message}`);
  return data === true;
}

// Gives the scan back after a failed analysis. Never throws: the user's error matters more.
export async function refundScan(identity: Identity): Promise<void> {
  const { error } = await getAdminClient().rpc("refund_scan", {
    p_visitor: identity.kind === "visitor" ? identity.visitorId : null,
    p_user: identity.kind === "user" ? identity.userId : null,
  });
  if (error) console.error("Could not refund scan", { code: error.code });
}

async function readUsed(identity: Identity): Promise<number> {
  const admin = getAdminClient();
  const { data, error } =
    identity.kind === "user"
      ? await admin.from("profiles").select("scans_used").eq("id", identity.userId).single()
      : await admin.from("visitor_usage").select("scans_used").eq("visitor_id", identity.visitorId).maybeSingle();
  if (error) throw new Error(`Could not read usage: ${error.message}`);
  return data?.scans_used ?? 0;
}

export async function getQuota(identity: Identity): Promise<Quota> {
  return buildQuota(identity.plan, await readUsed(identity));
}
