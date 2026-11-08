import type { Verdict } from "@/lib/analyze/schema";

export const HISTORY_PAGE_SIZE = 20;
export const HISTORY_MAX_PAGE_SIZE = 50;
export const INSIGHTS_DAYS = 14;
export const SIGNED_URL_TTL_SECONDS = 3600;

export type ScanItem = {
  id: string;
  batchId: string | null;
  fileName: string;
  verdict: Verdict;
  confidence: number;
  reason: string | null;
  createdAt: string;
  flagged: boolean;
  thumbUrl: string | null;
};

export type ScanPage = { items: ScanItem[]; nextCursor: string | null };

export type DayCount = { date: string; hotDogs: number; notHotDogs: number };

export type Stats = {
  total: number;
  hotDogs: number;
  notHotDogs: number;
  hotDogRate: number;
  avgConfidence: number;
  lowConfidence: number;
  flagged: number;
  perDay: DayCount[];
};
