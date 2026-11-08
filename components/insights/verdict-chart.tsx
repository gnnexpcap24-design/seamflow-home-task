"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDay } from "@/lib/format";
import type { DayCount } from "@/lib/scans/shared";

const chartConfig = {
  hotDogs: { label: "Hot Dog", color: "var(--chart-1)" },
  notHotDogs: { label: "Not Hot Dog", color: "var(--chart-2)" },
} satisfies ChartConfig;

// Stacked bars per day. The container needs an explicit height, otherwise it renders empty.
export function VerdictChart({ data }: { data: DayCount[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={12}
          tickFormatter={(value: string) => formatDay(value)}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDay(String(value), "long")} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="hotDogs" stackId="scans" fill="var(--color-hotDogs)" radius={[0, 0, 4, 4]} />
        <Bar dataKey="notHotDogs" stackId="scans" fill="var(--color-notHotDogs)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
