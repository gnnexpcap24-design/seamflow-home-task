"use client";

import Link from "next/link";
import { useState } from "react";
import { Analyzer } from "@/components/analyzer";
import { BatchUploader } from "@/components/batch/batch-uploader";
import { useQuota } from "@/components/quota-provider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "single" | "batch";

// Single image and batch share the main page. Batch is disabled, with a visible reason, without a Pro plan.
// The server enforces Pro as well, so this only decides what the page offers.
export function HomeWorkspace() {
  const [mode, setMode] = useState<Mode>("single");
  const { me } = useQuota();
  const batchAllowed = me?.plan === "pro";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Analyze</h1>
        <p className="text-muted-foreground">Upload an image and get a definitive Hot Dog or Not Hot Dog verdict.</p>
      </div>
      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <div className="flex flex-col gap-2">
          <TabsList className="h-11">
            <TabsTrigger value="single">Single image</TabsTrigger>
            <TabsTrigger value="batch" disabled={!batchAllowed}>
              Batch
              {!batchAllowed && <Badge variant="outline" className="ml-1.5">Pro</Badge>}
            </TabsTrigger>
          </TabsList>
          {me && !batchAllowed && (
            <p className="text-sm text-muted-foreground">
              Batch upload is part of the Pro plan.{" "}
              <Link href="/pricing" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
                View plans
              </Link>
            </p>
          )}
        </div>
        <TabsContent value="single" className="mt-6">
          <Analyzer />
        </TabsContent>
        {/* Stays mounted while hidden so a running batch is not lost when switching modes. */}
        <TabsContent value="batch" keepMounted className="mt-6">
          <BatchUploader />
        </TabsContent>
      </Tabs>
    </div>
  );
}
