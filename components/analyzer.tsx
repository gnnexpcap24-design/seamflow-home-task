"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorAlert } from "@/components/error-alert";
import { QuotaDialog } from "@/components/quota-dialog";
import { useQuota } from "@/components/quota-provider";
import { UploadZone, type Preview } from "@/components/upload-zone";
import { VerdictCard } from "@/components/verdict-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError, requestAnalysis } from "@/lib/analyze/client";
import { API_ERRORS } from "@/lib/analyze/errors";
import type { AnalyzeResponse } from "@/lib/analyze/schema";
import type { PlanName, UpgradeTarget } from "@/lib/plans";
import { CompressionError, compressImage } from "@/lib/image/compress";
import { MAX_PICK_BYTES, validateFileMeta } from "@/lib/validation/file";

type Prepared = { file: File; originalName: string; preview: Preview };
type Phase = "idle" | "preparing" | "ready" | "analyzing" | "done" | "error";

const NETWORK_MESSAGE = "We couldn't reach the server. Check your connection and try again.";
const TOO_BIG_MESSAGE = "This image is larger than 10 MB. Choose a smaller image.";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Analyzer() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitTarget, setLimitTarget] = useState<UpgradeTarget | null>(null);
  const { me, setQuota, refresh } = useQuota();

  useEffect(() => {
    const url = prepared?.preview.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [prepared]);

  const handleSelect = useCallback(async (file: File, source: "picker" | "paste") => {
    setResult(null);
    setError(null);
    const problem = validateFileMeta(file, MAX_PICK_BYTES);
    if (problem) {
      setPhase("error");
      setError(problem === "file_too_large" ? TOO_BIG_MESSAGE : API_ERRORS.unsupported_type.message);
      return;
    }
    setPhase("preparing");
    try {
      const compressed = await compressImage(file);
      const preview = { url: URL.createObjectURL(compressed), name: file.name, sizeLabel: formatSize(compressed.size) };
      setPrepared({ file: compressed, originalName: file.name, preview });
      setPhase("ready");
      if (source === "paste") toast("Image added from clipboard");
    } catch (caught) {
      setPhase("error");
      setError(caught instanceof CompressionError ? caught.message : API_ERRORS.image_rejected.message);
    }
  }, []);

  async function analyze() {
    if (!prepared) return;
    setPhase("analyzing");
    setError(null);
    try {
      const { quota, ...analysis } = await requestAnalysis(prepared.file);
      setResult(analysis);
      setPhase("done");
      if (quota) setQuota(quota);
      else void refresh();
    } catch (caught) {
      handleAnalyzeError(caught);
    }
  }

  function handleAnalyzeError(caught: unknown) {
    if (caught instanceof ApiRequestError && caught.code === "quota_exceeded") {
      setLimitTarget(caught.upgradeTo ?? "pro");
      setPhase("ready");
      void refresh();
      return;
    }
    setError(caught instanceof ApiRequestError ? caught.message : NETWORK_MESSAGE);
    setPhase("error");
  }

  function reset() {
    setPrepared(null);
    setResult(null);
    setError(null);
    setPhase("idle");
  }

  const busy = phase === "preparing" || phase === "analyzing";
  const canAnalyze = prepared !== null && (phase === "ready" || phase === "analyzing");

  return (
    <div className="flex flex-col gap-6">
      <UploadZone preview={prepared?.preview ?? null} disabled={busy} onSelect={handleSelect} />

      {canAnalyze && (
        <Button className="h-11 w-fit px-5" onClick={analyze} disabled={phase === "analyzing"}>
          Analyze image
        </Button>
      )}

      <div aria-live="polite">
        {phase === "preparing" && <p className="text-sm text-muted-foreground">Preparing image...</p>}
        {phase === "analyzing" && <AnalyzingCard />}
        {phase === "done" && result && prepared && (
          <VerdictCard result={result} fileName={prepared.originalName} saveStatus={saveStatus(result, me?.plan)} onReset={reset} />
        )}
        {phase === "error" && error && (
          <ErrorAlert message={error} onRetry={prepared ? analyze : undefined} />
        )}
      </div>
      <QuotaDialog target={limitTarget} onClose={() => setLimitTarget(null)} />
    </div>
  );
}

// Only Pro accounts have history, so only they see a save note.
function saveStatus(result: AnalyzeResponse, plan: PlanName | undefined): "saved" | "failed" | null {
  if (result.saved) return "saved";
  return plan === "pro" ? "failed" : null;
}

function AnalyzingCard() {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Analyzing image...</p>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  );
}
