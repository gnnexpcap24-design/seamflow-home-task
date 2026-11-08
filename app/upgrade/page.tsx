import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UpgradeForm } from "@/components/upgrade-form";
import { getAuthUser } from "@/lib/auth/identity";

export const metadata = { title: "Upgrade | Hot Dog or Not" };

export default async function UpgradePage() {
  if (!(await getAuthUser())) redirect("/login");
  return (
    <AppShell>
      <UpgradeForm />
    </AppShell>
  );
}
