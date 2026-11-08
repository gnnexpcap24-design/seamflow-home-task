import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <span className="text-base font-semibold">Hot Dog or Not</span>
          <Badge variant="secondary">Enterprise Edition</Badge>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">{children}</main>
      <footer className="border-t">
        <p className="mx-auto w-full max-w-5xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Images are processed in memory and are not stored.
        </p>
      </footer>
    </div>
  );
}
