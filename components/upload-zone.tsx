"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ImageUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ALLOWED_TYPES } from "@/lib/validation/file";

export type Preview = { url: string; name: string; sizeLabel: string };

type Props = {
  preview: Preview | null;
  disabled: boolean;
  onSelect: (file: File, source: "picker" | "paste") => void;
};

function imageFromClipboard(event: ClipboardEvent): File | null {
  const item = Array.from(event.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
  return item?.getAsFile() ?? null;
}

export function UploadZone({ preview, disabled, onSelect }: Props) {
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
    <Card className="border-2 border-dashed bg-card ring-0 [--card-spacing:--spacing(6)]">
      <CardContent>
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
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
            <img
              src={preview.url}
              alt={`Preview of ${preview.name}`}
              className="h-32 w-32 rounded-lg object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-center sm:text-left">
              <p className="truncate text-base font-medium">{preview.name}</p>
              <p className="text-sm text-muted-foreground tabular-nums">{preview.sizeLabel}</p>
            </div>
            <Button variant="outline" className="h-11 px-4" disabled={disabled} onClick={openPicker}>
              Choose a different image
            </Button>
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
            className={`flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg px-4 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              dragging ? "bg-muted" : ""
            }`}
          >
            <ImageUpIcon aria-hidden="true" className="size-8 text-muted-foreground" />
            <p className="text-base font-medium">Drop an image here, click to browse, or paste</p>
            <p className="text-sm text-muted-foreground">JPEG, PNG or WebP, up to 10 MB</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
