import type { Verdict } from "@/lib/analyze/schema";
import type { BatchItem, ItemStatus } from "@/lib/batch/queue";

export type StatusFilter = "all" | "done" | "failed" | "pending" | "canceled";
export type SortOrder = "none" | "high" | "low";
export type ViewOptions = { verdict: "all" | Verdict; status: StatusFilter; sort: SortOrder };

const PENDING: ItemStatus[] = ["queued", "compressing", "analyzing"];

function matchesStatus(item: BatchItem, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "pending") return PENDING.includes(item.status);
  return item.status === status;
}

// Items without a result (not finished yet, or failed) always sort last.
function byConfidence(order: "high" | "low") {
  return (a: BatchItem, b: BatchItem): number => {
    if (!a.result || !b.result) return Number(!a.result) - Number(!b.result);
    return order === "high" ? b.result.confidence - a.result.confidence : a.result.confidence - b.result.confidence;
  };
}

export function filterAndSort(items: readonly BatchItem[], { verdict, status, sort }: ViewOptions): BatchItem[] {
  const visible = items.filter(
    (item) => matchesStatus(item, status) && (verdict === "all" || item.result?.verdict === verdict),
  );
  return sort === "none" ? visible : visible.sort(byConfidence(sort));
}

export const BATCH_PAGE_SIZE = 5;

// One page of a list. An out-of-range page number is moved to the nearest valid page.
export function paginate<T>(items: readonly T[], page: number, size = BATCH_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(page, 1), pageCount);
  return { items: items.slice((current - 1) * size, current * size), page: current, pageCount };
}
