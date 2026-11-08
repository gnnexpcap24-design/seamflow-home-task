"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlanName, Quota } from "@/lib/plans";

type Me = { authenticated: boolean; plan: PlanName; quota: Quota };
type QuotaContextValue = { me: Me | null; setQuota: (quota: Quota) => void; refresh: () => Promise<void> };

const QuotaContext = createContext<QuotaContextValue | null>(null);

async function fetchMe(): Promise<Me | null> {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    return response.ok ? ((await response.json()) as Me) : null;
  } catch {
    return null; // The meter simply stays hidden if the request fails.
  }
}

// Holds the current plan and quota for the top bar meter. The server is the source of truth.
export function QuotaProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    const latest = await fetchMe();
    if (latest) setMe(latest);
  }, []);

  const setQuota = useCallback((quota: Quota) => {
    setMe((previous) => (previous ? { ...previous, plan: quota.plan, quota } : previous));
  }, []);

  useEffect(() => {
    let active = true;
    void fetchMe().then((latest) => {
      if (active && latest) setMe(latest);
    });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({ me, setQuota, refresh }), [me, setQuota, refresh]);
  return <QuotaContext.Provider value={value}>{children}</QuotaContext.Provider>;
}

export function useQuota(): QuotaContextValue {
  const context = useContext(QuotaContext);
  if (!context) throw new Error("useQuota must be used inside QuotaProvider");
  return context;
}
