import type { AnalyzeResponse } from "@/lib/analyze/schema";
import { BATCH_CONCURRENCY, BATCH_MAX_FILES } from "@/lib/plans";

export type ItemStatus = "queued" | "compressing" | "analyzing" | "done" | "failed" | "canceled";

export type BatchResult = Pick<AnalyzeResponse, "verdict" | "confidence" | "reason" | "lowConfidence" | "analyzedAt">;

export type BatchItem = {
  id: string;
  file: File;
  status: ItemStatus;
  prepared?: File;
  result?: BatchResult;
  error?: { code: string; message: string };
};

// A failure with a stable code and a message that is safe to show to the user.
export class BatchFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export type QueueDeps = {
  prepare: (file: File) => Promise<File>;
  analyze: (file: File) => Promise<BatchResult>;
  sleep?: (ms: number) => Promise<void>;
  createId?: () => string;
  concurrency?: number;
  maxFiles?: number;
};

export type AddOutcome = { added: number; duplicates: string[]; tooMany: boolean };

const RATE_LIMIT_RETRIES = 2;
const DEFAULT_RETRY_AFTER_SECONDS = 5;
const UNKNOWN_FAILURE = { code: "unknown", message: "Something went wrong with this image. Try again." };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const fileKey = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

// Runs one request per image with limited concurrency. No React and no fetch in here:
// the work is injected, so the whole queue can be tested with fakes.
export class BatchQueue {
  private items: BatchItem[] = [];
  private snapshot: readonly BatchItem[] = [];
  private listeners = new Set<() => void>();
  private active = false;
  private running = 0;
  private readonly deps: Required<QueueDeps>;

  constructor(deps: QueueDeps) {
    this.deps = {
      sleep: defaultSleep,
      createId: () => crypto.randomUUID(),
      concurrency: BATCH_CONCURRENCY,
      maxFiles: BATCH_MAX_FILES,
      ...deps,
    };
  }

  getItems = (): readonly BatchItem[] => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // Rejects the whole selection if it would exceed the limit. Nothing is dropped silently.
  add(files: File[]): AddOutcome {
    const known = new Set(this.items.map((item) => fileKey(item.file)));
    const duplicates: string[] = [];
    const fresh = files.filter((file) => {
      if (known.has(fileKey(file))) {
        duplicates.push(file.name);
        return false;
      }
      known.add(fileKey(file));
      return true;
    });
    if (this.items.length + fresh.length > this.deps.maxFiles) return { added: 0, duplicates, tooMany: true };
    this.items.push(...fresh.map((file) => ({ id: this.deps.createId(), file, status: "queued" as const })));
    this.emit();
    return { added: fresh.length, duplicates, tooMany: false };
  }

  start(): void {
    this.active = true;
    this.pump();
  }

  // Stops starting new items. Items already being processed finish.
  cancel(): void {
    this.active = false;
    this.items.forEach((item) => {
      if (item.status === "queued") item.status = "canceled";
    });
    this.emit();
  }

  retry(id: string): void {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item && (item.status === "failed" || item.status === "canceled")) this.requeue([item]);
  }

  retryFailed(): void {
    this.requeue(this.items.filter((item) => item.status === "failed"));
  }

  clear(): void {
    this.active = false;
    this.items = [];
    this.emit();
  }

  private requeue(items: BatchItem[]): void {
    items.forEach((item) => {
      item.status = "queued";
      item.error = undefined;
      item.result = undefined;
    });
    this.active = true;
    this.emit();
    this.pump();
  }

  private pump(): void {
    while (this.active && this.running < this.deps.concurrency) {
      const next = this.items.find((item) => item.status === "queued");
      if (!next) return;
      void this.run(next);
    }
  }

  private async run(item: BatchItem): Promise<void> {
    this.running += 1;
    try {
      this.update(item, { status: "compressing" });
      const prepared = item.prepared ?? (await this.deps.prepare(item.file));
      this.update(item, { status: "analyzing", prepared });
      this.update(item, { status: "done", result: await this.analyzeWithRetries(prepared) });
    } catch (error) {
      const failure = error instanceof BatchFailure ? { code: error.code, message: error.message } : UNKNOWN_FAILURE;
      this.update(item, { status: "failed", error: failure });
    } finally {
      this.running -= 1;
      this.pump();
    }
  }

  // A rate limit is retried after the delay the server asked for. Any other failure is not retried.
  private async analyzeWithRetries(file: File): Promise<BatchResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.deps.analyze(file);
      } catch (error) {
        const limited = error instanceof BatchFailure && error.code === "rate_limited";
        if (!limited || attempt >= RATE_LIMIT_RETRIES) throw error;
        await this.deps.sleep((error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000);
      }
    }
  }

  private update(item: BatchItem, changes: Partial<BatchItem>): void {
    if (!this.items.includes(item)) return; // The list was cleared while this item was running.
    Object.assign(item, changes);
    this.emit();
  }

  private emit(): void {
    this.snapshot = this.items.map((item) => ({ ...item }));
    this.listeners.forEach((listener) => listener());
  }
}

export type Summary = {
  total: number;
  done: number;
  failed: number;
  pending: number;
  hotDogs: number;
  notHotDogs: number;
  finished: boolean;
  progress: number;
};

export function summarize(items: readonly BatchItem[]): Summary {
  const count = (status: ItemStatus) => items.filter((item) => item.status === status).length;
  const done = count("done");
  const failed = count("failed");
  const pending = count("queued") + count("compressing") + count("analyzing");
  const hotDogs = items.filter((item) => item.result?.verdict === "hot_dog").length;
  const settled = items.length - pending;
  return {
    total: items.length,
    done,
    failed,
    pending,
    hotDogs,
    notHotDogs: done - hotDogs,
    finished: items.length > 0 && pending === 0,
    progress: items.length === 0 ? 0 : Math.round((settled / items.length) * 100),
  };
}
