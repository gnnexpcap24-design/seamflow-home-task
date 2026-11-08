"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorAlert } from "@/components/error-alert";
import { useQuota } from "@/components/quota-provider";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/browser";

export function AccountActions({ isPro }: { isPro: boolean }) {
  const router = useRouter();
  const { refresh } = useQuota();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    await getBrowserClient().auth.signOut();
    await refresh();
    router.push("/");
    router.refresh();
  }

  async function downgrade() {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch("/api/billing/downgrade", { method: "POST" });
      if (!response.ok) throw new Error("downgrade failed");
      await refresh();
      router.refresh();
    } catch {
      setFailure("We couldn't change the plan. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {failure && <ErrorAlert title="Plan change failed" message={failure} />}
      <div className="flex flex-wrap gap-3">
        <Button className="h-11 px-5" onClick={signOut} disabled={busy}>Sign out</Button>
        {isPro && (
          <Button variant="outline" className="h-11 px-5" onClick={downgrade} disabled={busy}>
            Demo only: downgrade to Free
          </Button>
        )}
      </div>
    </div>
  );
}
