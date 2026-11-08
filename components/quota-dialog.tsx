"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { PLANS, type UpgradeTarget } from "@/lib/plans";
import { cn } from "@/lib/utils";

type Props = { target: UpgradeTarget | null; onClose: () => void };

const COPY = {
  account: {
    text: `You've used your ${PLANS.visitor.scanLimit} free scans. Create a free account to unlock ${PLANS.free.scanLimit} more.`,
    actions: [
      { label: "Create account", href: "/signup", primary: true },
      { label: "Sign in", href: "/login", primary: false },
    ],
  },
  pro: {
    text: `You've used your ${PLANS.free.scanLimit} free scans. Upgrade to Pro for unlimited scans, history, and batch upload.`,
    actions: [{ label: "View Pro", href: "/pricing", primary: true }],
  },
} as const;

export function QuotaDialog({ target, onClose }: Props) {
  const copy = target ? COPY[target] : null;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan limit reached</DialogTitle>
          <DialogDescription>{copy?.text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {copy?.actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={cn(buttonVariants({ variant: action.primary ? "default" : "outline" }), "h-11 px-4")}
            >
              {action.label}
            </Link>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
