import { NextRequest, NextResponse } from "next/server";
import { isOutcomeStatus } from "@/lib/outcomes";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

// POST /api/outcomes  { beneficiaryId, status, notes? }
//
// Official marks a pipeline change for one beneficiary. Inserts an event
// row (latest wins on the dashboard); history is never overwritten - an
// official's clicks stay auditable, which is the coordination argument.
//
// Prototype honesty: this endpoint takes no auth. A district deployment
// sits the whole /dashboard behind the official SSO and this route with
// it; the demo instance treats it as open, ON PURPOSE and visibly.
export async function POST(req: NextRequest) {
  // Validate first: malformed input gets a 400 even when the DB is absent,
  // so dev-mode curl checks exercise the enum, not the short-circuit.
  const body = (await req.json().catch(() => ({}))) as {
    beneficiaryId?: unknown;
    status?: unknown;
    notes?: unknown;
  };
  const beneficiaryId =
    typeof body?.beneficiaryId === "string" &&
    /^[0-9a-fA-F-]{36}$/.test(body.beneficiaryId)
      ? body.beneficiaryId
      : null;
  if (!beneficiaryId || !isOutcomeStatus(body?.status)) {
    return NextResponse.json(
      { ok: false, reason: "invalid-input" },
      { status: 400 }
    );
  }
  const notes =
    typeof body?.notes === "string" && body.notes.trim()
      ? body.notes.trim().slice(0, 200)
      : null;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: true, saved: false, reason: "no-database-url" });
  }
  try {
    const inserted = await db
      .insert(schema.outcomes)
      .values({ beneficiaryId, status: body.status, notes })
      .returning({ id: schema.outcomes.id });

    const id = inserted[0]?.id ?? null;
    if (!id) throw new Error("no id");
    return NextResponse.json({ ok: true, saved: true, id });
  } catch {
    return NextResponse.json({ ok: true, saved: false, reason: "insert-failed" });
  }
}