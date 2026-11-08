import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PLANS, type PlanName } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pricing | Hot Dog or Not" };

type PlanCard = { name: PlanName; title: string; blurb: string; cta?: { label: string; href: string } };

const CARDS: PlanCard[] = [
  { name: "visitor", title: "Visitor", blurb: "No account needed." },
  { name: "free", title: "Free account", blurb: "Create an account for more scans.", cta: { label: "Create account", href: "/signup" } },
  { name: "pro", title: "Pro", blurb: "Unlimited scans and more.", cta: { label: "Upgrade", href: "/upgrade" } },
];

const ROWS = [
  { label: "Scans", value: (plan: PlanName) => PLANS[plan].scanLimit === null ? "Unlimited" : `${PLANS[plan].scanLimit} total` },
  { label: "Stored history", value: (plan: PlanName) => (PLANS[plan].history ? "Yes" : "No") },
  { label: "Batch upload", value: (plan: PlanName) => (PLANS[plan].batch ? "Yes" : "No") },
  { label: "Insights dashboard", value: (plan: PlanName) => (PLANS[plan].insights ? "Yes" : "No") },
];

export default function PricingPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <h1 className="text-2xl font-semibold">Plans</h1>

        <div className="grid gap-6 md:grid-cols-3">
          {CARDS.map((card) => (
            <Card key={card.name} className={cn("[--card-spacing:--spacing(6)]", card.name === "pro" && "ring-2 ring-primary")}>
              <CardHeader>
                <CardTitle className="text-lg">{card.title}</CardTitle>
                <CardDescription>{card.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-base font-medium">{ROWS[0].value(card.name)}</p>
                {card.cta && (
                  <Link href={card.cta.href} className={cn(buttonVariants({ variant: card.name === "pro" ? "default" : "outline" }), "h-11 w-fit px-5")}>
                    {card.cta.label}
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature</TableHead>
              {CARDS.map((card) => <TableHead key={card.name}>{card.title}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="font-medium">{row.label}</TableCell>
                {CARDS.map((card) => <TableCell key={card.name}>{row.value(card.name)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">History, batch upload and insights are being rolled out to Pro accounts.</p>
      </div>
    </AppShell>
  );
}
