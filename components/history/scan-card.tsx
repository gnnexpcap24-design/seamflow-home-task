import { FlagIcon, ImageOffIcon, Trash2Icon } from "lucide-react";
import { VerdictBadge } from "@/components/verdict-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPercent, formatRelativeTime } from "@/lib/format";
import type { ScanItem } from "@/lib/scans/shared";

type Props = {
  scan: ScanItem;
  onImageError: () => void;
  onDelete: (scan: ScanItem) => void;
  onToggleFlag: (scan: ScanItem) => void;
};

export function ScanCard({ scan, onImageError, onDelete, onToggleFlag }: Props) {
  return (
    <Card className="[--card-spacing:--spacing(4)]">
      {scan.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
        <img
          src={scan.thumbUrl}
          alt={`Thumbnail of ${scan.fileName}`}
          onError={onImageError}
          className="aspect-square w-full object-cover"
        />
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
          <ImageOffIcon aria-hidden="true" className="size-6" />
          Preview unavailable
        </div>
      )}
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <VerdictBadge verdict={scan.verdict} />
          <span className="text-sm tabular-nums">{formatPercent(scan.confidence)}</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium" title={scan.fileName}>{scan.fileName}</p>
          {scan.batchId && <Badge variant="outline">Batch</Badge>}
        </div>
        {scan.reason && <p className="text-sm text-muted-foreground">{scan.reason}</p>}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {formatRelativeTime(scan.createdAt)}
            {scan.flagged && " · Flagged as wrong"}
          </p>
          <div className="flex gap-1">
            <Button
              variant={scan.flagged ? "secondary" : "ghost"}
              className="size-11"
              aria-label={scan.flagged ? "Remove the wrong-result flag" : "Flag this result as wrong"}
              aria-pressed={scan.flagged}
              onClick={() => onToggleFlag(scan)}
            >
              <FlagIcon aria-hidden="true" />
            </Button>
            <Button variant="ghost" className="size-11" aria-label={`Delete ${scan.fileName}`} onClick={() => onDelete(scan)}>
              <Trash2Icon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
