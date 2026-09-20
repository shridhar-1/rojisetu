import { NextRequest, NextResponse } from "next/server";
import { toLang } from "@/lib/i18n";
import { runAICustomTask } from "@/lib/ai-router";
import {
  aiPicksToItems,
  makePicksValidator,
  parseAIPicks,
  recommendSystemPrompt,
  recommendUserPayload,
  runDeterministicStage,
  type RecItem,
  type RecTopics,
} from "@/lib/recommend";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

// POST /api/recommend
// Body: { lang, profile: { topics }, beneficiaryId?, ai?: true|false }
//
// Deterministic floors first (subtractive, counted). The AI lane then only
// RE-RANKS the surviving shortlist and phrases one-line reasons in the
// beneficiary's language; it can never add back an excluded role or invent
// a fact (strict JSON contract + id allowlist). Fail-safe: deterministic
// floor ships on any failure and the lane failure reason stays visible.
//
// Persistence: when beneficiaryId is supplied and the DB is attached, rows
// land in `recommendations` (rank, engine label, reasons + reasonsByLang).
// `stored` and the insert outcome are reported honestly.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      lang?: unknown;
      profile?: { topics?: RecTopics };
      beneficiaryId?: unknown;
      ai?: unknown;
    };
    const lang = toLang(typeof body?.lang === "string" ? body.lang : null);
    const topics: RecTopics = body?.profile?.topics ?? {};
    const beneficiaryId =
      typeof body?.beneficiaryId === "string" &&
      /^[0-9a-fA-F-]{36}$/.test(body.beneficiaryId)
        ? body.beneficiaryId
        : null;

    const stage = runDeterministicStage(topics);

    let items: RecItem[] = stage.recommendations;
    let engine = "deterministic-floor";
    let aiLane: string | null = null;

    if (body.ai !== false && stage.ranked.length > 0) {
      const allowed = stage.shortlistIds;
      const task = {
        system: recommendSystemPrompt(lang),
        user: recommendUserPayload(stage.facts, stage.ranked),
        maxTokens: 320,
        validate: makePicksValidator(allowed),
      };
      const ai = await runAICustomTask({ task, lang });
      aiLane = ai.reason;
      if (ai.text && ai.engine) {
        const picks = parseAIPicks(ai.text, allowed);
        if (picks && picks.length > 0) {
          items = aiPicksToItems(picks, stage.ranked);
          engine = ai.engine;
        }
      }
    }

    // Persist when linked to a beneficiary and the DB is attached.
    let stored = false;
    let storedIds: string[] | null = null;
    const db = getDb();
    if (beneficiaryId && db) {
      try {
        const rows = await db
          .insert(schema.recommendations)
          .values(
            items.map((it) => ({
              beneficiaryId,
              nsqfRoleCode: it.roleId,
              roleTitle: it.roleTitle,
              nsqfLevel: it.nsqfLevel,
              sector: it.sector,
              rank: it.rank,
              eligible: true,
              reasons: it.reasons,
              reasonsByLang: { [lang]: it.reasons },
              engine,
            }))
          )
          .returning({ id: schema.recommendations.id });
        stored = rows.length === items.length && rows.length > 0;
        storedIds = rows.map((r) => r.id);
      } catch {
        stored = false;
      }
    }

    return NextResponse.json({
      ok: true,
      engine,
      aiLane,
      recommendations: items,
      floorsApplied: stage.report.applied,
      excluded: stage.report.excluded,
      stored,
      storedIds,
      honestyNote:
        "NSQF levels and education floors are indicative; verify against the current qualification pack before enrolment decisions.",
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "recommend-failed" }, { status: 500 });
  }
}