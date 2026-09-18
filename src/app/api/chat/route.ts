import { NextRequest, NextResponse } from "next/server";
import { toLang, type Lang } from "@/lib/i18n";
import {
  getDeterministicTurn,
  sanitizeCandidate,
  type ChatMessage,
} from "@/lib/chat-extract";
import { rephraseQuestionWithAI } from "@/lib/ai-router";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 40;
const MAX_CHARS = 2000;

function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (
      m &&
      typeof m === "object" &&
      ((m as ChatMessage).role === "assistant" ||
        (m as ChatMessage).role === "user") &&
      typeof (m as ChatMessage).text === "string" &&
      (m as ChatMessage).text.length <= MAX_CHARS
    ) {
      out.push({ role: (m as ChatMessage).role, text: (m as ChatMessage).text });
    }
  }
  return out;
}

function respond(
  lang: Lang,
  reply: string,
  engine: string,
  profile: unknown,
  done: boolean
) {
  return NextResponse.json({ ok: true, lang, reply, engine, profile, done });
}

// POST /api/chat
// Body: { lang: "hi", history: [{role, text}, ...], ai?: boolean }
// The server is stateless: the client keeps the history and the engine
// recomputes the profile every turn. Works on Vercel functions with no store.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      lang?: unknown;
      history?: unknown;
      ai?: unknown;
    };
    const lang = toLang(typeof body.lang === "string" ? body.lang : null);
    const history = sanitizeHistory(body.history);
    const allowAI = body.ai !== false;

    const turn = getDeterministicTurn(history, lang);
    let reply = turn.reply;
    let engine: string = turn.engine;

    // Only genuine next-questions are offered to the AI lanes for a warm
    // rephrase. Openings, acks and the done screen stay deterministic.
    if (allowAI && turn.replyKind === "question" && turn.topic) {
      const ai = await rephraseQuestionWithAI({ base: turn.reply, lang });
      if (ai) {
        // LLM-proof: candidate must ask the expected topic and that topic
        // must still be unknown, else the deterministic question ships.
        const checked = sanitizeCandidate(
          ai.text,
          turn.topic,
          turn.profile,
          turn.reply
        );
        reply = checked.text;
        engine = checked.engine === "ai-ok" ? ai.engine : "guard-swap";
      }
    }

    return respond(lang, reply, engine, turn.profile, turn.done);
  } catch {
    // Honest floor: never brick the kiosk. Deterministic opening on any error.
    const turn = getDeterministicTurn([], "en");
    return respond("en", turn.reply, "fallback", turn.profile, false);
  }
}
