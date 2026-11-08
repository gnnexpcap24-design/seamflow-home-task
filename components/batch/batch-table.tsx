import { Loader2Icon, RotateCcwIcon } from "lucide-react";
import { VerdictBadge } from "@/components/verdict-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BatchItem, ItemStatus } from "@/lib/batch/queue";
import { formatPercent } from "@/lib/format";

type Props = {
  items: readonly BatchItem[];
  previews: Record<string, string>;
  onRetry: (id: string) => void;
};

const STATUS_LABELS: Record<ItemStatus, string> = {
  queued: "Queued",
  compressing: "Preparing",
  analyzing: "Analyzing",
  done: "Done",
  failed: "Failed",
  canceled: "Canceled",
};

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const busy = status === "compressing" || status === "analyzing";
  return (
    <Badge variant={status === "failed" ? "destructive" : "outline"} className="gap-1.5">
      {busy && <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

// Compact rows (thumbnail, name and reason, verdict, status) so a full page of results fits on screen.
export function BatchTable({ items, previews, onRetry }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File</TableHead>
          <TableHead>Verdict</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const detail = item.error?.message ?? item.result?.reason;
          return (
            <TableRow key={item.id}>
              <TableCell className="max-w-0 w-full">
                <div className="flex items-center gap-3">
                  {previews[item.id] && (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                    <img src={previews[item.id]} alt={`Thumbnail of ${item.file.name}`} className="size-12 shrink-0 rounded-md object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={item.file.name}>{item.file.name}</p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {formatSize(item.file.size)}
                    </p>
                    {detail && (
                      <p className={item.error ? "truncate text-xs text-error-foreground" : "truncate text-xs text-muted-foreground"} title={detail}>
                        {detail}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {item.result && (
                  <div className="flex flex-col items-start gap-1">
                    <VerdictBadge verdict={item.result.verdict} />
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                      {formatPercent(item.result.confidence)}
                      {item.result.lowConfidence && <Badge variant="outline">Low</Badge>}
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <StatusBadge status={item.status} />
                  {(item.status === "failed" || item.status === "canceled") && (
                    <Button variant="ghost" className="size-11" aria-label={`Retry ${item.file.name}`} onClick={() => onRetry(item.id)}>
                      <RotateCcwIcon aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
