"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ImagesIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BATCH_MAX_FILES } from "@/lib/plans";
import { ALLOWED_TYPES } from "@/lib/validation/file";

type Props = { disabled: boolean; onSelect: (files: File[]) => void };

export function BatchDropZone({ disabled, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0 && !disabled) onSelect(files);
  }

  return (
    <Card className="border-2 border-dashed ring-0 [--card-spacing:--spacing(6)]">
      <CardContent>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(",")}
          aria-label="Choose images to analyze"
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) onSelect(files);
          }}
        />
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label="Upload images: drop them here or press Enter to browse"
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg px-4 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
            dragging ? "bg-muted" : ""
          }`}
        >
          <ImagesIcon aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="text-base font-medium">Drop images here or click to browse</p>
          <p className="text-sm text-muted-foreground">
            Up to {BATCH_MAX_FILES} images. JPEG, PNG or WebP, up to 10 MB each
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
