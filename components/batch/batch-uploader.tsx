"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DownloadIcon } from "lucide-react";
import { BatchDropZone } from "@/components/batch/batch-drop-zone";
import { BatchTable } from "@/components/batch/batch-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeInBatch, prepareFile } from "@/lib/batch/adapters";
import { buildCsv, csvFileName } from "@/lib/batch/csv";
import { BatchQueue, summarize, type AddOutcome } from "@/lib/batch/queue";
import { filterAndSort, type SortOrder, type StatusFilter, type ViewOptions } from "@/lib/batch/view";
import { BATCH_MAX_FILES } from "@/lib/plans";
import { cn } from "@/lib/utils";

type Session = { id: string; queue: BatchQueue };

const SORT_LABELS: Record<SortOrder, string> = {
  none: "Sort by confidence",
  high: "Confidence: high first",
  low: "Confidence: low first",
};
const NEXT_SORT: Record<SortOrder, SortOrder> = { none: "high", high: "low", low: "none" };

// One session is one batch: its id groups every scan of the batch in history.
function newSession(): Session {
  const id = crypto.randomUUID();
  return { id, queue: new BatchQueue({ prepare: prepareFile, analyze: analyzeInBatch(id) }) };
}

function downloadCsv(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName();
  link.click();
  URL.revokeObjectURL(url);
}

function describeSelection(outcome: AddOutcome, selected: number): string | null {
  if (outcome.tooMany) {
    return `You can analyze up to ${BATCH_MAX_FILES} images at a time. This selection would go over that limit, so no images were added.`;
  }
  if (outcome.duplicates.length === 0) return null;
  return `${outcome.duplicates.length} of ${selected} already added and skipped: ${outcome.duplicates.join(", ")}.`;
}

export function BatchUploader() {
  const [session, setSession] = useState(newSession);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<ViewOptions>({ verdict: "all", status: "all", sort: "none" });
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewUrls = useRef<string[]>([]);

  const items = useSyncExternalStore(session.queue.subscribe, session.queue.getItems, session.queue.getItems);
  const summary = summarize(items);
  const running = items.some((item) => ["compressing", "analyzing"].includes(item.status));
  const visible = filterAndSort(items, view);

  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  useEffect(() => {
    const urls = previewUrls;
    return () => urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function addFiles(files: File[]) {
    const before = new Set(session.queue.getItems().map((item) => item.id));
    const outcome = session.queue.add(files);
    setNotice(describeSelection(outcome, files.length));
    const created: Record<string, string> = {};
    session.queue.getItems().filter((item) => !before.has(item.id)).forEach((item) => {
      created[item.id] = URL.createObjectURL(item.file);
      previewUrls.current.push(created[item.id]);
    });
    setPreviews((current) => ({ ...current, ...created }));
  }

  function startOver() {
    session.queue.clear();
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
    setPreviews({});
    setNotice(null);
    setView({ verdict: "all", status: "all", sort: "none" });
    setSession(newSession());
  }

  return (
    <div className="flex flex-col gap-6">
      <BatchDropZone disabled={running} onSelect={addFiles} />

      <div aria-live="polite" className="flex flex-col gap-3">
        {notice && (
          <Alert className="p-3">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {items.length > 0 && (
          <p className="sr-only">
            {summary.done + summary.failed} of {summary.total} images processed, {summary.failed} failed.
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add up to {BATCH_MAX_FILES} images to analyze them in one go.</p>
      ) : (
        <>
          <SummaryBar summary={summary} />

          <div className="flex flex-wrap items-center gap-3">
            <Button className="h-11 px-5" onClick={() => session.queue.start()} disabled={running || !items.some((item) => item.status === "queued")}>
              Analyze all
            </Button>
            {running && (
              <Button variant="outline" className="h-11 px-5" onClick={() => session.queue.cancel()}>
                Cancel remaining
              </Button>
            )}
            <Button variant="outline" className="h-11 px-5" onClick={() => session.queue.retryFailed()} disabled={summary.failed === 0}>
              Retry failed
            </Button>
            <Button variant="outline" className="h-11 px-5" onClick={() => downloadCsv(buildCsv(items))} disabled={summary.done === 0}>
              <DownloadIcon aria-hidden="true" data-icon="inline-start" />
              Export CSV
            </Button>
            <Button variant="ghost" className="h-11 px-5" onClick={startOver} disabled={running}>
              Start over
            </Button>
            {summary.finished && (
              <Link href="/history" className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-5")}>
                View in History
              </Link>
            )}
          </div>

          <Filters view={view} onChange={setView} />

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images match these filters.</p>
          ) : (
            <BatchTable items={visible} previews={previews} onRetry={(id) => session.queue.retry(id)} />
          )}
        </>
      )}
    </div>
  );
}

function SummaryBar({ summary }: { summary: ReturnType<typeof summarize> }) {
  const stats = [
    ["Total", summary.total],
    ["Done", summary.done],
    ["Failed", summary.failed],
    ["Hot dogs", summary.hotDogs],
    ["Not hot dogs", summary.notHotDogs],
  ] as const;
  return (
    <Card className="[--card-spacing:--spacing(4)]">
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <Progress value={summary.progress} aria-label="Batch progress" />
      </CardContent>
    </Card>
  );
}

function Filters({ view, onChange }: { view: ViewOptions; onChange: (view: ViewOptions) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Tabs value={view.verdict} onValueChange={(verdict) => onChange({ ...view, verdict: verdict as ViewOptions["verdict"] })}>
        <TabsList className="h-11" aria-label="Filter by verdict">
          <TabsTrigger value="all">All verdicts</TabsTrigger>
          <TabsTrigger value="hot_dog">Hot Dog</TabsTrigger>
          <TabsTrigger value="not_hot_dog">Not Hot Dog</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={view.status} onValueChange={(status) => onChange({ ...view, status: status as StatusFilter })}>
        <TabsList className="h-11" aria-label="Filter by status">
          <TabsTrigger value="all">All statuses</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button variant="outline" className="h-11 px-4" onClick={() => onChange({ ...view, sort: NEXT_SORT[view.sort] })}>
        {SORT_LABELS[view.sort]}
      </Button>
    </div>
  );
}
