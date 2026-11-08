"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorAlert } from "@/components/error-alert";
import { VerdictChart } from "@/components/insights/verdict-chart";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { INSIGHTS_DAYS, type Stats } from "@/lib/scans/shared";
import { summarizeDays } from "@/lib/scans/stats";
import { cn } from "@/lib/utils";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; stats: Stats };

async function fetchStats(): Promise<Stats> {
  const response = await fetch("/api/stats", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load stats");
  return (await response.json()) as Stats;
}

export function InsightsDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetchStats()
      .then((stats) => active && setState({ status: "ready", stats }))
      .catch(() => active && setState({ status: "error" }));
    return () => {
      active = false;
    };
  }, []);

  function retry() {
    setState({ status: "loading" });
    fetchStats()
      .then((stats) => setState({ status: "ready", stats }))
      .catch(() => setState({ status: "error" }));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Insights</h1>
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && (
        <ErrorAlert title="Could not load insights" message="Your insights could not be loaded. Please try again." onRetry={retry} />
      )}
      {state.status === "ready" && (state.stats.total === 0 ? <EmptyState /> : <Dashboard stats={state.stats} />)}
    </div>
  );
}

function Dashboard({ stats }: { stats: Stats }) {
  const recent = summarizeDays(stats.perDay);
  const cards = [
    { label: "Total scans", value: String(stats.total) },
    { label: "Hot dog rate", value: formatPercent(stats.hotDogRate) },
    { label: "Average confidence", value: formatPercent(stats.avgConfidence) },
    { label: "Low confidence", value: String(stats.lowConfidence) },
    { label: "Flagged as wrong", value: String(stats.flagged) },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} className="[--card-spacing:--spacing(4)]">
            <CardContent className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="text-base">Scans per day, last {INSIGHTS_DAYS} days</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <VerdictChart data={stats.perDay} />
          <p className="text-sm text-muted-foreground">
            {recent.total} {recent.total === 1 ? "scan" : "scans"} in the last {INSIGHTS_DAYS} days, {recent.hotDogs} hot{" "}
            {recent.hotDogs === 1 ? "dog" : "dogs"}.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="mx-auto w-full max-w-lg [--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-4">
        <p className="text-base font-medium">No scans to show yet.</p>
        <p className="text-sm text-muted-foreground">Analyze an image and your insights will appear here.</p>
        <Link href="/" className={cn(buttonVariants(), "h-11 w-fit px-5")}>Analyze an image</Link>
      </CardContent>
    </Card>
  );
}
