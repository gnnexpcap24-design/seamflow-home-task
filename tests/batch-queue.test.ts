import { describe, expect, it, vi } from "vitest";
import { BatchFailure, BatchQueue, summarize, type BatchResult } from "@/lib/batch/queue";

const RESULT: BatchResult = {
  verdict: "hot_dog",
  confidence: 0.9,
  reason: "Sausage in a bun.",
  lowConfidence: false,
  analyzedAt: "2026-11-08T11:30:00.000Z",
};

function makeFile(name: string, size = 10, lastModified = 1) {
  return new File(["x".repeat(size)], name, { type: "image/jpeg", lastModified });
}

function makeFiles(count: number) {
  return Array.from({ length: count }, (_, index) => makeFile(`photo-${index}.jpg`, 10 + index));
}

// Each analyze call waits until the test releases it, so concurrency can be observed.
function controlledAnalyze() {
  const pending: { name: string; resolve: () => void; reject: (error: Error) => void }[] = [];
  let inFlight = 0;
  let peak = 0;
  const analyze = vi.fn((file: File) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    return new Promise<BatchResult>((resolve, reject) => {
      pending.push({
        name: file.name,
        resolve: () => {
          inFlight -= 1;
          resolve(RESULT);
        },
        reject: (error) => {
          inFlight -= 1;
          reject(error);
        },
      });
    });
  });
  return { analyze, pending, peak: () => peak };
}

const prepare = async (file: File) => file;
const status = (queue: BatchQueue, name: string) => queue.getItems().find((item) => item.file.name === name)?.status;

describe("BatchQueue", () => {
  it("never runs more than 3 items at the same time and completes all of them", async () => {
    const control = controlledAnalyze();
    const queue = new BatchQueue({ prepare, analyze: control.analyze });
    queue.add(makeFiles(8));
    queue.start();

    await vi.waitFor(() => expect(control.pending).toHaveLength(3));
    while (queue.getItems().some((item) => item.status !== "done")) {
      control.pending.shift()?.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(control.peak()).toBe(3);
    expect(summarize(queue.getItems())).toMatchObject({ total: 8, done: 8, failed: 0, finished: true });
  });

  it("lets one failure happen without stopping the others", async () => {
    const analyze = vi.fn(async (file: File) => {
      if (file.name === "photo-1.jpg") throw new BatchFailure("Not an image", "unsupported_type");
      return RESULT;
    });
    const queue = new BatchQueue({ prepare, analyze });
    queue.add(makeFiles(4));
    queue.start();

    await vi.waitFor(() => expect(summarize(queue.getItems()).finished).toBe(true));
    expect(summarize(queue.getItems())).toMatchObject({ done: 3, failed: 1 });
    expect(queue.getItems().find((item) => item.status === "failed")?.error).toEqual({
      code: "unsupported_type",
      message: "Not an image",
    });
  });

  it("marks a failed preparation as failed without calling analyze", async () => {
    const analyze = vi.fn(async () => RESULT);
    const failing = async () => {
      throw new BatchFailure("Too large", "file_too_large");
    };
    const queue = new BatchQueue({ prepare: failing, analyze });
    queue.add(makeFiles(1));
    queue.start();

    await vi.waitFor(() => expect(status(queue, "photo-0.jpg")).toBe("failed"));
    expect(analyze).not.toHaveBeenCalled();
  });

  it("retries only the failed item, not the finished ones", async () => {
    let failOnce = true;
    const analyze = vi.fn(async (file: File) => {
      if (file.name === "photo-1.jpg" && failOnce) {
        failOnce = false;
        throw new BatchFailure("Down", "model_error");
      }
      return RESULT;
    });
    const queue = new BatchQueue({ prepare, analyze });
    queue.add(makeFiles(3));
    queue.start();
    await vi.waitFor(() => expect(summarize(queue.getItems()).finished).toBe(true));
    expect(analyze).toHaveBeenCalledTimes(3);

    queue.retryFailed();
    await vi.waitFor(() => expect(summarize(queue.getItems()).failed).toBe(0));
    expect(analyze).toHaveBeenCalledTimes(4);
    expect(analyze).toHaveBeenLastCalledWith(expect.objectContaining({ name: "photo-1.jpg" }));
  });

  it("does not compress again when only the analysis failed", async () => {
    let failOnce = true;
    const prepareSpy = vi.fn(prepare);
    const analyze = vi.fn(async () => {
      if (failOnce) {
        failOnce = false;
        throw new BatchFailure("Down", "model_error");
      }
      return RESULT;
    });
    const queue = new BatchQueue({ prepare: prepareSpy, analyze });
    queue.add(makeFiles(1));
    queue.start();
    await vi.waitFor(() => expect(status(queue, "photo-0.jpg")).toBe("failed"));

    queue.retry(queue.getItems()[0].id);
    await vi.waitFor(() => expect(status(queue, "photo-0.jpg")).toBe("done"));
    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });

  it("cancel stops new items from starting and lets running items finish", async () => {
    const control = controlledAnalyze();
    const queue = new BatchQueue({ prepare, analyze: control.analyze });
    queue.add(makeFiles(6));
    queue.start();
    await vi.waitFor(() => expect(control.pending).toHaveLength(3));

    queue.cancel();
    expect(queue.getItems().filter((item) => item.status === "canceled")).toHaveLength(3);

    control.pending.forEach((call) => call.resolve());
    await vi.waitFor(() => expect(summarize(queue.getItems()).done).toBe(3));
    expect(control.analyze).toHaveBeenCalledTimes(3);
  });

  it("can retry a canceled item", async () => {
    const control = controlledAnalyze();
    const queue = new BatchQueue({ prepare, analyze: control.analyze, concurrency: 1 });
    queue.add(makeFiles(2));
    queue.start();
    await vi.waitFor(() => expect(control.pending).toHaveLength(1));
    queue.cancel();
    control.pending[0].resolve();
    await vi.waitFor(() => expect(status(queue, "photo-0.jpg")).toBe("done"));

    queue.retry(queue.getItems()[1].id);
    await vi.waitFor(() => expect(control.pending).toHaveLength(2));
    control.pending[1].resolve();
    await vi.waitFor(() => expect(status(queue, "photo-1.jpg")).toBe("done"));
  });

  describe("rate limiting", () => {
    it("waits for Retry-After and retries the item automatically", async () => {
      const sleep = vi.fn(async () => {});
      const analyze = vi
        .fn<(file: File) => Promise<BatchResult>>()
        .mockRejectedValueOnce(new BatchFailure("Slow down", "rate_limited", 7))
        .mockResolvedValueOnce(RESULT);
      const queue = new BatchQueue({ prepare, analyze, sleep });
      queue.add(makeFiles(1));
      queue.start();

      await vi.waitFor(() => expect(status(queue, "photo-0.jpg")).toBe("done"));
      expect(sleep).toHaveBeenCalledWith(7000);
      expect(analyze).toHaveBeenCalledTimes(2);
    });

    it("gives up after 2 automatic retries", async () => {
      const sleep = vi.fn(async () => {});
      const analyze = vi.fn(async () => {
        throw new BatchFailure("Slow down", "rate_limited");
      });
      const queue = new BatchQueue({ prepare, analyze, sleep });
      queue.add(makeFiles(1));
      queue.start();

      await vi.waitFor(() => expect(status(queue, "photo-0.jpg")).toBe("failed"));
      expect(analyze).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledWith(5000);
    });

    it("does not retry other errors automatically", async () => {
      const sleep = vi.fn(async () => {});
      const analyze = vi.fn(async () => {
        throw new BatchFailure("Down", "model_error");
      });
      const queue = new BatchQueue({ prepare, analyze, sleep });
      queue.add(makeFiles(1));
      queue.start();

      await vi.waitFor(() => expect(status(queue, "photo-0.jpg")).toBe("failed"));
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  describe("adding files", () => {
    it("skips duplicates by name, size and last-modified and reports them", () => {
      const queue = new BatchQueue({ prepare, analyze: async () => RESULT });
      expect(queue.add([makeFile("a.jpg", 5, 1)])).toMatchObject({ added: 1, duplicates: [] });
      const outcome = queue.add([makeFile("a.jpg", 5, 1), makeFile("a.jpg", 5, 2), makeFile("a.jpg", 6, 1)]);
      expect(outcome).toEqual({ added: 2, duplicates: ["a.jpg"], tooMany: false });
      expect(queue.getItems()).toHaveLength(3);
    });

    it("rejects a selection that would exceed 25 files and adds nothing", () => {
      const queue = new BatchQueue({ prepare, analyze: async () => RESULT });
      expect(queue.add(makeFiles(25))).toMatchObject({ added: 25, tooMany: false });
      expect(queue.add([makeFile("extra.jpg", 99)])).toEqual({ added: 0, duplicates: [], tooMany: true });
      expect(queue.getItems()).toHaveLength(25);

      const fresh = new BatchQueue({ prepare, analyze: async () => RESULT });
      expect(fresh.add(makeFiles(26)).tooMany).toBe(true);
      expect(fresh.getItems()).toHaveLength(0);
    });
  });

  describe("subscriptions and clearing", () => {
    it("notifies subscribers on every change until they unsubscribe", async () => {
      const queue = new BatchQueue({ prepare, analyze: async () => RESULT });
      const listener = vi.fn();
      const unsubscribe = queue.subscribe(listener);
      queue.add(makeFiles(1));
      expect(listener).toHaveBeenCalledTimes(1);

      queue.start();
      await vi.waitFor(() => expect(status(queue, "photo-0.jpg")).toBe("done"));
      expect(listener.mock.calls.length).toBeGreaterThan(3);

      unsubscribe();
      const calls = listener.mock.calls.length;
      queue.clear();
      expect(listener).toHaveBeenCalledTimes(calls);
    });

    it("hands out a stable snapshot between changes and a new one after each change", () => {
      const queue = new BatchQueue({ prepare, analyze: async () => RESULT });
      const empty = queue.getItems();
      expect(queue.getItems()).toBe(empty);
      queue.add(makeFiles(1));
      expect(queue.getItems()).not.toBe(empty);
    });

    it("ignores late updates from items that were cleared", async () => {
      const control = controlledAnalyze();
      const queue = new BatchQueue({ prepare, analyze: control.analyze });
      queue.add(makeFiles(1));
      queue.start();
      await vi.waitFor(() => expect(control.pending).toHaveLength(1));

      queue.clear();
      control.pending[0].resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(queue.getItems()).toHaveLength(0);
    });
  });
});

describe("summarize", () => {
  it("counts verdicts, failures and progress", async () => {
    const analyze = vi.fn(async (file: File) => {
      if (file.name === "photo-0.jpg") return { ...RESULT, verdict: "not_hot_dog" as const };
      if (file.name === "photo-1.jpg") throw new BatchFailure("Down", "model_error");
      return RESULT;
    });
    const queue = new BatchQueue({ prepare, analyze });
    queue.add(makeFiles(4));
    expect(summarize(queue.getItems())).toMatchObject({ total: 4, pending: 4, finished: false, progress: 0 });

    queue.start();
    await vi.waitFor(() => expect(summarize(queue.getItems()).finished).toBe(true));
    expect(summarize(queue.getItems())).toEqual({
      total: 4,
      done: 3,
      failed: 1,
      pending: 0,
      hotDogs: 2,
      notHotDogs: 1,
      finished: true,
      progress: 100,
    });
  });

  it("is not finished for an empty batch", () => {
    expect(summarize([])).toMatchObject({ total: 0, finished: false, progress: 0 });
  });
});
