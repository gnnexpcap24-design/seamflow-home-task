import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageCount?: number;
  hasPrevious: boolean;
  hasNext: boolean;
  busy?: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

// Previous / Next with the current page. pageCount is omitted when the total is not known.
export function PaginationControls({ page, pageCount, hasPrevious, hasNext, busy = false, onPrevious, onNext }: Props) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <Button variant="outline" className="h-11 px-4" disabled={!hasPrevious || busy} onClick={onPrevious}>
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {pageCount ? `Page ${page} of ${pageCount}` : `Page ${page}`}
      </span>
      <Button variant="outline" className="h-11 px-4" disabled={!hasNext || busy} onClick={onNext}>
        Next
        <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
      </Button>
    </nav>
  );
}
