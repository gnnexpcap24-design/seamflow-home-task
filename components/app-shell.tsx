import type { ReactNode } from "react";
import { TopBar } from "@/components/top-bar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">{children}</main>
      <footer className="border-t">
        <p className="mx-auto w-full max-w-5xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Images are processed in memory. Pro accounts keep a private history that only you can see.
        </p>
      </footer>
    </div>
  );
}
