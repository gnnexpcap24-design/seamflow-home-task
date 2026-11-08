"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ImageUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ALLOWED_TYPES } from "@/lib/validation/file";

export type Preview = { url: string; name: string; sizeLabel: string };

type Props = {
  preview: Preview | null;
  disabled: boolean;
  action?: ReactNode;
  onSelect: (file: File, source: "picker" | "paste") => void;
};

function imageFromClipboard(event: ClipboardEvent): File | null {
  const item = Array.from(event.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
  return item?.getAsFile() ?? null;
}

export function UploadZone({ preview, disabled, action, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (disabled) return;
    function handlePaste(event: ClipboardEvent) {
      const file = imageFromClipboard(event);
      if (file) onSelect(file, "paste");
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [disabled, onSelect]);

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onSelect(file, "picker");
  }

  return (
    <Card className="flex-1 border-2 border-dashed border-foreground/20 bg-card shadow-none ring-0 [--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-1 flex-col gap-4">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          aria-label="Choose an image to analyze"
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onSelect(file, "picker");
          }}
        />
        {preview ? (
          <div className="flex flex-1 flex-col gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
            <img
              src={preview.url}
              alt={`Preview of ${preview.name}`}
              className="h-48 w-full rounded-lg bg-muted object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate text-base font-medium">{preview.name}</p>
                <p className="text-sm text-muted-foreground tabular-nums">{preview.sizeLabel}</p>
              </div>
              <Button variant="outline" className="h-11 px-4" disabled={disabled} onClick={openPicker}>
                Choose a different image
              </Button>
            </div>
            {action && <div className="mt-auto">{action}</div>}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-label="Upload an image: drop it here, press Enter to browse, or paste"
            onClick={openPicker}
            onKeyDown={handleKeyDown}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex min-h-64 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg px-4 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              dragging ? "bg-muted" : "hover:bg-muted/50"
            }`}
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
              <ImageUpIcon aria-hidden="true" className="size-7" />
            </span>
            <p className="text-base font-medium">Drop an image here, click to browse, or paste</p>
            <p className="text-sm text-muted-foreground">JPEG, PNG or WebP, up to 10 MB</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
