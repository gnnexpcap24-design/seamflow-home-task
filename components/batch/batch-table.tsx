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

export function BatchTable({ items, previews, onRetry }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Image</TableHead>
          <TableHead>File</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Verdict</TableHead>
          <TableHead className="text-right">Confidence</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="w-14">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              {previews[item.id] && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                <img src={previews[item.id]} alt={`Thumbnail of ${item.file.name}`} className="size-12 rounded-md object-cover" />
              )}
            </TableCell>
            <TableCell className="max-w-48">
              <p className="truncate font-medium" title={item.file.name}>{item.file.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatSize(item.file.size)}</p>
            </TableCell>
            <TableCell><StatusBadge status={item.status} /></TableCell>
            <TableCell>{item.result && <VerdictBadge verdict={item.result.verdict} />}</TableCell>
            <TableCell className="text-right tabular-nums">
              {item.result && (
                <span className="inline-flex items-center gap-2">
                  {item.result.lowConfidence && <Badge variant="outline">Low</Badge>}
                  {formatPercent(item.result.confidence)}
                </span>
              )}
            </TableCell>
            <TableCell className="max-w-72 whitespace-normal">
              {item.error ? <span className="text-error-foreground">{item.error.message}</span> : item.result?.reason}
            </TableCell>
            <TableCell>
              {(item.status === "failed" || item.status === "canceled") && (
                <Button variant="ghost" className="size-11" aria-label={`Retry ${item.file.name}`} onClick={() => onRetry(item.id)}>
                  <RotateCcwIcon aria-hidden="true" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
