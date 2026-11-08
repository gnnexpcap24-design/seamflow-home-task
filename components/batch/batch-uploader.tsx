"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DownloadIcon, ListChecksIcon } from "lucide-react";
import { BatchDropZone } from "@/components/batch/batch-drop-zone";
import { BatchTable } from "@/components/batch/batch-table";
import { PaginationControls } from "@/components/pagination-controls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeInBatch, prepareFile } from "@/lib/batch/adapters";
import { buildCsv, csvFileName } from "@/lib/batch/csv";
import { BatchQueue, summarize, type AddOutcome } from "@/lib/batch/queue";
import { filterAndSort, paginate, type SortOrder, type StatusFilter, type ViewOptions } from "@/lib/batch/view";
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
  const [page, setPage] = useState(1);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewUrls = useRef<string[]>([]);

  const items = useSyncExternalStore(session.queue.subscribe, session.queue.getItems, session.queue.getItems);
  const summary = summarize(items);
  const running = items.some((item) => ["compressing", "analyzing"].includes(item.status));
  const visible = filterAndSort(items, view);
  const paged = paginate(visible, page);

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
    setPage(1);
    setView({ verdict: "all", status: "all", sort: "none" });
    setSession(newSession());
  }

  function changeView(next: ViewOptions) {
    setView(next);
    setPage(1);
  }

  const hasItems = items.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col gap-4">
        <BatchDropZone disabled={running} compact={hasItems} onSelect={addFiles} />

        <div aria-live="polite" className="flex flex-col gap-3">
          {notice && (
            <Alert className="p-3">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {hasItems && (
            <p className="sr-only">
              {summary.done + summary.failed} of {summary.total} images processed, {summary.failed} failed.
            </p>
          )}
        </div>

        {hasItems && (
          <>
            <SummaryBar summary={summary} />
            <Actions
              running={running}
              canStart={items.some((item) => item.status === "queued")}
              summary={summary}
              onStart={() => session.queue.start()}
              onCancel={() => session.queue.cancel()}
              onRetryFailed={() => session.queue.retryFailed()}
              onExport={() => downloadCsv(buildCsv(items))}
              onStartOver={startOver}
            />
            <Filters view={view} onChange={changeView} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {!hasItems && <ResultsPlaceholder />}
        {hasItems && visible.length === 0 && (
          <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No images match these filters.
          </p>
        )}
        {hasItems && visible.length > 0 && (
          <>
            <Card className="flex-1 py-2 [--card-spacing:--spacing(2)]">
              <CardContent className="px-2">
                <BatchTable items={paged.items} previews={previews} onRetry={(id) => session.queue.retry(id)} />
              </CardContent>
            </Card>
            <PaginationControls
              page={paged.page}
              pageCount={paged.pageCount}
              hasPrevious={paged.page > 1}
              hasNext={paged.page < paged.pageCount}
              onPrevious={() => setPage(paged.page - 1)}
              onNext={() => setPage(paged.page + 1)}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Keeps the right column occupied before any image is added.
function ResultsPlaceholder() {
  return (
    <Card className="min-h-64 flex-1 justify-center border-dashed shadow-none [--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <ListChecksIcon aria-hidden="true" className="size-6" />
        </span>
        <p className="text-sm text-muted-foreground">
          Add up to {BATCH_MAX_FILES} images. Results appear here as each one finishes.
        </p>
      </CardContent>
    </Card>
  );
}

type ActionsProps = {
  running: boolean;
  canStart: boolean;
  summary: ReturnType<typeof summarize>;
  onStart: () => void;
  onCancel: () => void;
  onRetryFailed: () => void;
  onExport: () => void;
  onStartOver: () => void;
};

function Actions({ running, canStart, summary, onStart, onCancel, onRetryFailed, onExport, onStartOver }: ActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button className="col-span-2 h-11" onClick={onStart} disabled={running || !canStart}>
        Analyze all
      </Button>
      {running && (
        <Button variant="outline" className="col-span-2 h-11" onClick={onCancel}>
          Cancel remaining
        </Button>
      )}
      <Button variant="outline" className="h-11" onClick={onRetryFailed} disabled={summary.failed === 0}>
        Retry failed
      </Button>
      <Button variant="outline" className="h-11" onClick={onExport} disabled={summary.done === 0}>
        <DownloadIcon aria-hidden="true" data-icon="inline-start" />
        Export CSV
      </Button>
      <Button variant="ghost" className="h-11" onClick={onStartOver} disabled={running}>
        Start over
      </Button>
      {summary.finished && (
        <Link href="/history" className={cn(buttonVariants({ variant: "ghost" }), "h-11")}>
          View in History
        </Link>
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
        <dl className="grid grid-cols-3 gap-3">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
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
    <div className="flex flex-col gap-2">
      <Tabs value={view.verdict} onValueChange={(verdict) => onChange({ ...view, verdict: verdict as ViewOptions["verdict"] })}>
        <TabsList className="h-11 w-full" aria-label="Filter by verdict">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="hot_dog">Hot Dog</TabsTrigger>
          <TabsTrigger value="not_hot_dog">Not Hot Dog</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={view.status} onValueChange={(status) => onChange({ ...view, status: status as StatusFilter })}>
        <TabsList className="h-11 w-full" aria-label="Filter by status">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button variant="outline" className="h-11" onClick={() => onChange({ ...view, sort: NEXT_SORT[view.sort] })}>
        {SORT_LABELS[view.sort]}
      </Button>
    </div>
  );
}
