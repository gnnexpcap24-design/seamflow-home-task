import { CircleCheckIcon, CircleSlashIcon } from "lucide-react";
import type { Verdict } from "@/lib/analyze/schema";
import { cn } from "@/lib/utils";

// Icon plus text, so the verdict never depends on color alone.
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const isHotDog = verdict === "hot_dog";
  const Icon = isHotDog ? CircleCheckIcon : CircleSlashIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium",
        isHotDog ? "bg-hotdog text-hotdog-foreground" : "bg-nothotdog text-nothotdog-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {isHotDog ? "Hot Dog" : "Not Hot Dog"}
    </span>
  );
}
