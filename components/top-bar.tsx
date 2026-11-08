"use client";

import Link from "next/link";
import { useQuota } from "@/components/quota-provider";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { quotaLabel } from "@/lib/plans";
import { cn } from "@/lib/utils";

const navLink = cn(buttonVariants({ variant: "ghost" }), "h-11 px-3");

export function TopBar() {
  const { me } = useQuota();

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/" className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="text-base font-semibold">Hot Dog or Not</span>
          <Badge variant="secondary" className="hidden sm:inline-flex">Enterprise Edition</Badge>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
          {me && (
            <span className="px-2 text-muted-foreground tabular-nums" data-testid="quota-meter">
              {quotaLabel(me.quota)}
            </span>
          )}
          <Link href="/pricing" className={navLink}>Pricing</Link>
          {me?.authenticated ? (
            <Link href="/account" className={navLink}>Account</Link>
          ) : (
            <>
              <Link href="/login" className={navLink}>Log in</Link>
              <Link href="/signup" className={cn(buttonVariants(), "h-11 px-4")}>Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
