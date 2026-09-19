import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

// Day 3 post-schema verification: proves DATABASE_URL connects AND can run
// a query. Reports ok/failure only - never the connection string or errors
// that could leak internals.
export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: false, reason: "no-database-url" });
  }
  try {
    const rows = (await db.execute(sql`select now() as now`)) as unknown as {
      now: string;
    }[];
    return NextResponse.json({ ok: true, db: "connected", now: rows[0]?.now ?? null });
  } catch {
    return NextResponse.json({ ok: false, reason: "connect-failed" });
  }
}