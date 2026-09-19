import { NextRequest, NextResponse } from "next/server";
import { toLang } from "@/lib/i18n";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

const MAX_TRANSCRIPT = 60;
const MAX_CHARS = 2000;

type IncomingTopic = { status?: unknown; value?: unknown; canonical?: unknown };

function topicString(t: IncomingTopic | undefined): string | null {
  if (!t || t.status !== "known" || typeof t.value !== "string") return null;
  const v = t.value.trim();
  return v ? v.slice(0, 140) : null;
}

function topicCanonical(t: IncomingTopic | undefined): string | null {
  if (!t || typeof t.canonical !== "string") return null;
  return t.canonical.slice(0, 40);
}

// POST /api/beneficiaries/save
// Body: { lang, profile: {topics: {...}}, transcript: [{role, text, lang}] }
// Persists a finished interview. Honest result: saved:false with a reason
// when the database is not attached yet - the kiosk thanks screen says so.
// Consent note: saving happens only on the beneficiary's explicit
// "Confirm and finish" tap; DPDP consent screens stay on the roadmap.
export async function POST(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: true, saved: false, reason: "no-database-url" });
  }
  try {
    const body = (await req.json()) as {
      lang?: unknown;
      profile?: { topics?: Record<string, IncomingTopic> };
      transcript?: unknown;
    };
    const topics = body?.profile?.topics ?? {};
    const lang = toLang(typeof body?.lang === "string" ? body.lang : null);

    const transcript: { role: string; text: string; lang: string }[] = [];
    if (Array.isArray(body?.transcript)) {
      for (const m of body.transcript.slice(0, MAX_TRANSCRIPT)) {
        if (
          m &&
          (m.role === "assistant" || m.role === "user") &&
          typeof m.text === "string" &&
          m.text.length <= MAX_CHARS
        ) {
          transcript.push({ role: m.role, text: m.text, lang });
        }
      }
    }

    const skillsRaw = topicString(topics.skillsInterests);
    const inserted = await db
      .insert(schema.beneficiaries)
      .values({
        lang,
        education: topicString(topics.education),
        familyOccupation: topicString(topics.familyOccupation),
        currentLivelihood: topicString(topics.currentLivelihood),
        skills: skillsRaw ? [skillsRaw] : [],
        interests: [],
        mobilityNotes: topicString(topics.mobility),
        workPreference:
          topicCanonical(topics.workPreference) ?? topicString(topics.workPreference),
        district: topicString(topics.district),
        profile: body.profile as Record<string, string | string[] | null>,
        transcript,
      })
      .returning({ id: schema.beneficiaries.id });

    const id = inserted[0]?.id ?? null;
    if (!id) throw new Error("no id");
    return NextResponse.json({ ok: true, saved: true, id });
  } catch {
    return NextResponse.json({ ok: true, saved: false, reason: "insert-failed" });
  }
}