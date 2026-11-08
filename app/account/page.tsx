import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account-actions";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthUser, resolveIdentity } from "@/lib/auth/identity";
import { getQuota } from "@/lib/quota";

export const metadata = { title: "Account | Hot Dog or Not" };

const PLAN_LABELS = { free: "Free", pro: "Pro" } as const;

export default async function AccountPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const identity = await resolveIdentity(user);
  const quota = await getQuota(identity);
  const plan = identity.plan === "pro" ? "pro" : "free";

  return (
    <AppShell>
      <Card className="mx-auto w-full max-w-md [--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{user.email}</dd>
            <dt className="text-muted-foreground">Plan</dt>
            <dd>{PLAN_LABELS[plan]}</dd>
            <dt className="text-muted-foreground">Scans used</dt>
            <dd className="tabular-nums">{quota.limit === null ? `${quota.used} (unlimited)` : `${quota.used} of ${quota.limit}`}</dd>
          </dl>
          <AccountActions isPro={plan === "pro"} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
