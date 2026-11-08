import { z } from "zod";

// Timestamps keep the database's microsecond precision, so they are never parsed into a JS Date.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

const CursorSchema = z.object({ createdAt: z.string().regex(TIMESTAMP), id: z.uuid() });

export type Cursor = z.infer<typeof CursorSchema>;
type Row = { id: string; created_at: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

// Returns null for anything that is not a cursor we produced, so it is safe to use in a query filter.
export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Rows are fetched with one extra item. Its presence means another page exists.
export function buildPage<T extends Row>(rows: T[], limit: number): { page: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const hasMore = rows.length > limit && last !== undefined;
  return { page, nextCursor: hasMore ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null };
}
