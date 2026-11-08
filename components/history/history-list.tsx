"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorAlert } from "@/components/error-alert";
import { ScanCard } from "@/components/history/scan-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Verdict } from "@/lib/analyze/schema";
import { HISTORY_PAGE_SIZE, type ScanItem, type ScanPage } from "@/lib/scans/shared";
import { cn } from "@/lib/utils";

type Filter = "all" | Verdict;
type Status = "loading" | "ready" | "error";

async function fetchPage(filter: Filter, cursor: string | null): Promise<ScanPage> {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (filter !== "all") params.set("verdict", filter);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/scans?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load history");
  return (await response.json()) as ScanPage;
}

export function HistoryList() {
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<ScanItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScanItem | null>(null);
  const pageCursors = useRef<(string | null)[]>([null]);
  const urlsRefreshed = useRef(false);

  function showFirstPage(page: ScanPage) {
    pageCursors.current = [null];
    urlsRefreshed.current = false;
    setItems(page.items);
    setNextCursor(page.nextCursor);
    setStatus("ready");
  }

  useEffect(() => {
    let active = true;
    fetchPage("all", null)
      .then((page) => active && showFirstPage(page))
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  function loadFirstPage(nextFilter: Filter) {
    setFilter(nextFilter);
    setStatus("loading");
    setActionError(null);
    fetchPage(nextFilter, null).then(showFirstPage).catch(() => setStatus("error"));
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setActionError(null);
    try {
      const page = await fetchPage(filter, nextCursor);
      pageCursors.current.push(nextCursor);
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      setActionError("We couldn't load more scans. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Signed URLs expire. On the first broken image, reload every loaded page once to get fresh ones.
  async function refreshImageUrls() {
    if (urlsRefreshed.current) return;
    urlsRefreshed.current = true;
    try {
      const pages = await Promise.all(pageCursors.current.map((cursor) => fetchPage(filter, cursor)));
      const fresh = new Map(pages.flatMap((page) => page.items).map((item) => [item.id, item.thumbUrl]));
      setItems((current) => current.map((item) => ({ ...item, thumbUrl: fresh.get(item.id) ?? item.thumbUrl })));
    } catch {
      // The cards keep their "Preview unavailable" placeholder.
    }
  }

  async function confirmDelete() {
    const scan = pendingDelete;
    if (!scan) return;
    setPendingDelete(null);
    const index = items.findIndex((item) => item.id === scan.id);
    setItems((current) => current.filter((item) => item.id !== scan.id));
    try {
      const response = await fetch(`/api/scans/${scan.id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error("delete failed");
      toast("Scan deleted");
    } catch {
      setItems((current) => [...current.slice(0, index), scan, ...current.slice(index)]);
      setActionError(`We couldn't delete ${scan.fileName}. Please try again.`);
    }
  }

  async function toggleFlag(scan: ScanItem) {
    const setFlag = (flagged: boolean) =>
      setItems((current) => current.map((item) => (item.id === scan.id ? { ...item, flagged } : item)));
    setFlag(!scan.flagged);
    try {
      const response = await fetch(`/api/scans/${scan.id}/flag`, { method: "POST" });
      if (!response.ok) throw new Error("flag failed");
      setFlag(((await response.json()) as { flagged: boolean }).flagged);
    } catch {
      setFlag(scan.flagged);
      setActionError("We couldn't update the flag. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">History</h1>

      <Tabs value={filter} onValueChange={(value) => loadFirstPage(value as Filter)}>
        <TabsList className="h-11">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="hot_dog">Hot Dog</TabsTrigger>
          <TabsTrigger value="not_hot_dog">Not Hot Dog</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-6 flex flex-col gap-6">
          {actionError && <ErrorAlert title="Action failed" message={actionError} />}
          {status === "loading" && <LoadingGrid />}
          {status === "error" && (
            <ErrorAlert title="Could not load history" message="Your scans could not be loaded. Please try again." onRetry={() => loadFirstPage(filter)} />
          )}
          {status === "ready" && items.length === 0 && <EmptyState filtered={filter !== "all"} />}
          {status === "ready" && items.length > 0 && (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((scan) => (
                  <ScanCard key={scan.id} scan={scan} onImageError={refreshImageUrls} onDelete={setPendingDelete} onToggleFlag={toggleFlag} />
                ))}
              </div>
              {nextCursor && (
                <Button variant="outline" className="h-11 w-fit px-5" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this scan?</AlertDialogTitle>
            <AlertDialogDescription>
              The result and its image will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-80 w-full" />
      ))}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Card className="mx-auto w-full max-w-lg [--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-4">
        <p className="text-base font-medium">{filtered ? "No scans with this verdict yet." : "No scans yet."}</p>
        <p className="text-sm text-muted-foreground">Analyze an image and it will appear here.</p>
        <Link href="/" className={cn(buttonVariants(), "h-11 w-fit px-5")}>Analyze an image</Link>
      </CardContent>
    </Card>
  );
}
