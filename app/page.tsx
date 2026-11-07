"use client";

import { useState } from "react";

type CheckResult = { ok: boolean; detail: string };
type Checks = { openai: CheckResult; supabase: CheckResult };

export default function Home() {
  const [checks, setChecks] = useState<Checks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runChecks() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/check");
      setChecks(await response.json());
    } catch {
      setError("Could not reach /api/check");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Setup check</h1>
      <button
        onClick={runChecks}
        disabled={loading}
        className="w-fit rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Checking…" : "Run checks"}
      </button>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {checks &&
        (["openai", "supabase"] as const).map((name) => (
          <p key={name}>
            <strong>{name}:</strong> {checks[name].ok ? "✅" : "❌"} {checks[name].detail}
          </p>
        ))}
    </main>
  );
}
