import type { Analysis } from "@/lib/analyze/schema";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/analyze/schema";
import { getAdminClient } from "@/lib/supabase/admin";
import { buildPage, type Cursor } from "@/lib/scans/cursor";
import {
  INSIGHTS_DAYS,
  SIGNED_URL_TTL_SECONDS,
  type ScanItem,
  type ScanPage,
  type Stats,
} from "@/lib/scans/shared";
import { buildStats, type RawStats } from "@/lib/scans/stats";

const BUCKET = "scans";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const LIST_COLUMNS = "id, file_name, image_path, verdict, confidence, reason, flagged, created_at";

type ScanRow = {
  id: string;
  file_name: string;
  image_path: string;
  verdict: ScanItem["verdict"];
  confidence: number | string;
  reason: string | null;
  flagged: boolean;
  created_at: string;
};

export type NewScan = {
  scanId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  analysis: Analysis;
};

// Uploads the image, then inserts the row. If the insert fails the uploaded file is removed again.
export async function saveScan(scan: NewScan): Promise<void> {
  const admin = getAdminClient();
  const path = `${scan.userId}/${scan.scanId}.${EXTENSIONS[scan.mimeType] ?? "jpg"}`;
  const upload = await admin.storage.from(BUCKET).upload(path, scan.buffer, { contentType: scan.mimeType });
  if (upload.error) throw new Error(`Upload failed: ${upload.error.message}`);

  const { error } = await admin.from("scans").insert({
    id: scan.scanId,
    user_id: scan.userId,
    file_name: scan.fileName,
    image_path: path,
    verdict: scan.analysis.verdict,
    confidence: scan.analysis.confidence,
    reason: scan.analysis.reason,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    throw new Error(`Insert failed: ${error.message}`);
  }
}

// One batch call signs every path on the page. A path that cannot be signed gets null.
async function signUrls(paths: string[]): Promise<Map<string, string | null>> {
  const urls = new Map<string, string | null>(paths.map((path) => [path, null]));
  if (paths.length === 0) return urls;
  const { data, error } = await getAdminClient().storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("Could not sign image URLs", { message: error?.message });
    return urls;
  }
  data.forEach((entry) => {
    if (entry.path && !entry.error) urls.set(entry.path, entry.signedUrl);
  });
  return urls;
}

function toItem(row: ScanRow, urls: Map<string, string | null>): ScanItem {
  return {
    id: row.id,
    fileName: row.file_name,
    verdict: row.verdict,
    confidence: Number(row.confidence),
    reason: row.reason,
    createdAt: row.created_at,
    flagged: row.flagged,
    thumbUrl: urls.get(row.image_path) ?? null,
  };
}

type ListOptions = { limit: number; cursor?: Cursor; verdict?: ScanItem["verdict"] };

// Keyset pagination on (created_at, id) descending, scoped to one user.
export async function listScans(userId: string, { limit, cursor, verdict }: ListOptions): Promise<ScanPage> {
  let query = getAdminClient()
    .from("scans")
    .select(LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (verdict) query = query.eq("verdict", verdict);
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Could not list scans: ${error.message}`);

  const { page, nextCursor } = buildPage((data ?? []) as ScanRow[], limit);
  const urls = await signUrls(page.map((row) => row.image_path));
  return { items: page.map((row) => toItem(row, urls)), nextCursor };
}

async function findOwnScan(userId: string, id: string) {
  const { data, error } = await getAdminClient()
    .from("scans")
    .select("id, image_path, flagged")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load scan: ${error.message}`);
  return data as { id: string; image_path: string; flagged: boolean } | null;
}

// Deletes the file first, then the row. Returns false if the scan is not the user's.
export async function deleteScan(userId: string, id: string): Promise<boolean> {
  const scan = await findOwnScan(userId, id);
  if (!scan) return false;
  const admin = getAdminClient();
  const removed = await admin.storage.from(BUCKET).remove([scan.image_path]);
  if (removed.error) throw new Error(`Could not delete image: ${removed.error.message}`);
  const { error } = await admin.from("scans").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Could not delete scan: ${error.message}`);
  return true;
}

// Returns the new flag value, or null if the scan is not the user's.
export async function toggleFlag(userId: string, id: string): Promise<boolean | null> {
  const scan = await findOwnScan(userId, id);
  if (!scan) return null;
  const flagged = !scan.flagged;
  const { error } = await getAdminClient().from("scans").update({ flagged }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Could not update flag: ${error.message}`);
  return flagged;
}

export async function getStats(userId: string): Promise<Stats> {
  const { data, error } = await getAdminClient().rpc("scan_stats", {
    p_user: userId,
    p_days: INSIGHTS_DAYS,
    p_low_confidence: LOW_CONFIDENCE_THRESHOLD,
  });
  if (error) throw new Error(`Could not load stats: ${error.message}`);
  return buildStats(data as RawStats);
}
