"use client";

import { ErrorAlert } from "@/components/error-alert";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <ErrorAlert title="Something went wrong" message="This page could not be loaded. Please try again." onRetry={reset} />
    </main>
  );
}
