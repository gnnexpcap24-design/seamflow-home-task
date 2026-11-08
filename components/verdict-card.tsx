import { CircleCheckIcon, CircleSlashIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AnalyzeResponse } from "@/lib/analyze/schema";

type Props = {
  result: AnalyzeResponse;
  fileName: string;
  saveStatus: "saved" | "failed" | null;
  onReset: () => void;
};

export function VerdictCard({ result, fileName, saveStatus, onReset }: Props) {
  const isHotDog = result.verdict === "hot_dog";
  const percent = Math.round(result.confidence * 100);
  const Icon = isHotDog ? CircleCheckIcon : CircleSlashIcon;
  const tone = isHotDog ? "bg-hotdog text-hotdog-foreground" : "bg-nothotdog text-nothotdog-foreground";

  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-6">
        <div className={`flex items-center gap-4 rounded-lg px-4 py-4 ${tone}`}>
          <Icon aria-hidden="true" className="size-10 shrink-0" />
          <p className="text-[40px] leading-tight font-bold">{isHotDog ? "Hot Dog" : "Not Hot Dog"}</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Confidence</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <Progress value={percent} aria-label="Confidence" />
          {result.lowConfidence && <Badge variant="outline" className="w-fit">Low confidence</Badge>}
        </div>

        <p className="text-base">{result.reason}</p>

        <p className="text-xs text-muted-foreground">
          {fileName} · {new Date(result.analyzedAt).toLocaleString()}
        </p>

        {saveStatus === "saved" && <p className="text-sm text-muted-foreground">Saved to history</p>}
        {saveStatus === "failed" && <p className="text-sm text-muted-foreground">Could not save to history</p>}

        <Button className="h-11 w-fit px-5" onClick={onReset}>
          Analyze another
        </Button>
      </CardContent>
    </Card>
  );
}
