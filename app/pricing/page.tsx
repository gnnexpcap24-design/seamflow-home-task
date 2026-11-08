import { CheckIcon, MinusIcon } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PLANS, type PlanName } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pricing | Hot Dog or Not" };

type PlanCard = { name: PlanName; title: string; blurb: string; cta?: { label: string; href: string } };

const CARDS: PlanCard[] = [
  { name: "visitor", title: "Visitor", blurb: "Try it without an account." },
  { name: "free", title: "Free account", blurb: "Create an account for more scans.", cta: { label: "Create account", href: "/signup" } },
  { name: "pro", title: "Pro", blurb: "Everything, with no scan limit.", cta: { label: "Upgrade to Pro", href: "/upgrade" } },
];

const FEATURES = [
  { label: "Stored history", key: "history" },
  { label: "Batch upload", key: "batch" },
  { label: "Insights dashboard", key: "insights" },
] as const;

function scanHeadline(plan: PlanName): string {
  const limit = PLANS[plan].scanLimit;
  return limit === null ? "Unlimited scans" : `${limit} scans`;
}

export default function PricingPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Plans</h1>
          <p className="text-muted-foreground">Pick the plan that fits how many images you need to check.</p>
        </div>

        <div className="grid items-stretch gap-6 md:grid-cols-3">
          {CARDS.map((card) => (
            <PlanCardView key={card.name} card={card} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

// Pro is a dark card with a badge, so it is clearly the highlighted choice. Features use icons plus text.
function PlanCardView({ card }: { card: PlanCard }) {
  const highlighted = card.name === "pro";
  const muted = highlighted ? "text-primary-foreground/70" : "text-muted-foreground";

  return (
    <Card
      className={cn(
        "gap-0 p-6",
        highlighted && "bg-primary text-primary-foreground shadow-lg ring-0 md:-mt-3 md:mb-3",
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{card.title}</h2>
        {highlighted && <Badge className="bg-primary-foreground text-primary">Recommended</Badge>}
      </div>
      <p className="mt-4 text-2xl font-semibold">{scanHeadline(card.name)}</p>
      <p className={cn("text-sm", muted)}>{card.blurb}</p>
      <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm">
        {FEATURES.map((feature) => {
          const included = PLANS[card.name][feature.key];
          return (
            <li key={feature.key} className={cn("flex items-center gap-2", !included && muted)}>
              {included ? (
                <CheckIcon aria-hidden="true" className={cn("size-4", highlighted ? "text-emerald-300" : "text-hotdog-foreground")} />
              ) : (
                <MinusIcon aria-hidden="true" className="size-4" />
              )}
              <span>{feature.label}</span>
              <span className="sr-only">{included ? "included" : "not included"}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-6">
        {card.cta ? (
          <Link
            href={card.cta.href}
            className={cn(
              buttonVariants({ variant: highlighted ? "secondary" : "outline" }),
              "h-11 w-full",
              highlighted && "bg-primary-foreground text-primary hover:bg-primary-foreground/90",
            )}
          >
            {card.cta.label}
          </Link>
        ) : (
          <p className={cn("text-sm", muted)}>No account needed.</p>
        )}
      </div>
    </Card>
  );
}
