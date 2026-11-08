import { getAdminClient } from "@/lib/supabase/admin";

export type BillingDetails = { company: string; billingEmail: string };

// Demo billing: flips the plan in the database. No payment is taken.
export async function upgradeToPro(userId: string, details: BillingDetails): Promise<void> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("profiles").select("pro_since").eq("id", userId).single();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      plan: "pro",
      pro_since: data.pro_since ?? new Date().toISOString(),
      company: details.company,
      billing_email: details.billingEmail,
    })
    .eq("id", userId);
  if (updateError) throw new Error(`Could not upgrade: ${updateError.message}`);
}

export async function downgradeToFree(userId: string): Promise<void> {
  const { error } = await getAdminClient().from("profiles").update({ plan: "free" }).eq("id", userId);
  if (error) throw new Error(`Could not downgrade: ${error.message}`);
}
