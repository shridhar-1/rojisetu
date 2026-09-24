import { NextRequest, NextResponse } from "next/server";
import { toLang, type Lang } from "@/lib/i18n";
import {
  getDeterministicTurn,
  sanitizeCandidate,
  type ChatMessage,
} from "@/lib/chat-extract";
import {
  rephraseQuestionWithAI,
  smallTalkWithAI,
  ackAndAskWithAI,
  answerUserQuestionWithAI,
} from "@/lib/ai-router";

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

// ---------------------------------------------------------------------------
// Day 12 small-talk detector. Only short greeting/thanks/filler utterances in
// the seven kiosk languages (+ english transliterations). Anything with a
// digit, anything long, and anything not in the lexicon is left alone - the
// route itself adds the strongest guard anyway: this lane is only ever
// consulted for utterances the ENGINE already rejected as answers.
// ---------------------------------------------------------------------------

const SMALLTALK_TERMS: string[] = [
  // english / transliteration
  "hi", "hii", "hello", "hey", "namaste", "namaskar", "namaskara", "namaskaram",
  "good morning", "good evening", "how are you", "how r u", "ok", "okay",
  "thank", "thanks", "thank you", "welcome", "bye", "hmm",
  // devanagari (hi/mr)
  "नमस्ते", "नमस्कार", "हाय", "हेलो", "शुभ प्रभात", "सुप्रभात", "धन्यवाद",
  // kannada
  "ನಮಸ್ಕಾರ", "ಹಾಯ್", "ಹಲೋ", "ಧನ್ಯವಾದ",
  // bengali
  "নমস্কার", "হাই", "হ্যালো", "ধন্যবাদ", "সুপ্রভাত",
  // tamil
  "வணக்கம்", "ஹாய்", "ஹலோ", "நன்றி",
  // telugu
  "నమస్తే", "నమస్కారం", "హాయ్", "ధన్యవాదాలు",
];

function looksLikeSmallTalk(text: string): boolean {
  const raw = text.trim().toLowerCase();
  if (!raw || raw.length > 60) return false;
  if (/\d/.test(raw)) return false; // digits are usually an ANSWER, not chit-chat
  const t = raw.replace(/[.!?,।;:\s]+/g, " ").trim();
  for (const term of SMALLTALK_TERMS) {
    if (t === term) return true;
    if (t.length <= 40 && (t.startsWith(term + " ") || t.endsWith(" " + term))) {
      return true;
    }
    if (t.length <= 24 && t.includes(term)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Day 13 user-question detector. The beneficiary is asking the ASSISTANT
// something ("nan en madbeku?", "what job?", "why is govt doing this?").
// Signals: a question mark, question words (all 7 scripts + transliteration),
// or domain words (job/training/scheme/govt) inside a SHORT utterance. The
// lane below only fires for utterances the ENGINE rejected as answers, so a
// real answer can never divert into a chat Q&A.
// ---------------------------------------------------------------------------

const USER_QUESTION_TERMS: string[] = [
  // english / transliteration
  "what", "why", "how", "when", "will i", "should i", "can i", "do i", "is it",
  "madbeku", "maadbeku", "madbeka", "beku", "yake", "yenu", "hege", "yelli",
  "yavaga", "barutha", "sigutta", "sigutha", "sikkodu", "sikkitava",
  "kya hai", "kaise", "kyun", "kyoon", "kab", "milega", "milegi", "hoga",
  "hogi", "karna", "kya kar", "kab tak", "why govt", "this scheme",
  // domain words (short utterances only, see length guard below)
  "job", "jobs", "training", "scheme", "yojana", "sarkar", "government",
  "govt", "pm-ajay", "ajay", "certificate", "salary", "paisa", "money",
  // devanagari (hi/mr)
  "क्या", "क्यों", "कैसे", "कब", "मिलेगा", "मिलेगी", "होगा", "होगी", "करना",
  "नौकरी", "काम", "प्रशिक्षण", "योजना", "सरकार", "काय", "कसा", "कसे", "करायचं",
  "कशाला",
  // kannada
  "ಏನು", "ಯಾವ", "ಏಕೆ", "ಹೇಗೆ", "ಬೇಕು", "ಮಾಡಬೇಕು", "ಸಿಗುತ್ತೆ", "ಬರೆ", "ಇಲ್ಲಿ",
  "ಕೆಲಸ", "ನೌಕರಿ", "ತರಬೇತಿ", "ಯೋಜನೆ", "सर्kaар",
  // bengali
  "কি", "কেন", "কীভাবে", "কখন", "পাব", "চাকরি", "প্রশিক্ষণ", "সরকার",
  // tamil
  "என்ன", "எப்படி", "ஏன்", "எப்போது", "கிடைக்கும்", "வேலை", "அரசு", "திட்டம்",
  // telugu
  "ఏమిటి", "ఎలా", "ఎందుకు", "ఎప్పుడు", "ఉద్యోగం", "ప్రభుత్వం", "పథకం",
];

function looksLikeUserQuestion(text: string): boolean {
  const raw = text.trim().toLowerCase();
  if (!raw || raw.length > 200) return false;
  if (raw.endsWith("?") || raw.endsWith("？")) return true;
  if (/\d/.test(raw) && raw.length <= 12) return false; // digit-led = an answer
  const t = raw.replace(/[.!?,।;:]+/g, " ").replace(/\s+/g, " ").trim();
  for (const term of USER_QUESTION_TERMS) {
    if (t.includes(term)) return true;
  }
  return false;
}

function lastUserText(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].text;
  }
  return "";
}

// POST /api/chat
// Body: { lang: "hi", history: [{role, text}, ...], ai?: boolean }
// The server is stateless: the client keeps the history and the engine
// recomputes the profile every turn. Works on Vercel functions with no store.
// aiLane always tells you exactly what the AI lanes did (honesty ledger).
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
    const userText = lastUserText(history);

    const turn = getDeterministicTurn(history, lang);
    let reply = turn.reply;
    let engine: string = turn.engine;
    let aiLane = "skipped:" + turn.replyKind;

    if (
      allowAI &&
      turn.replyKind === "question" &&
      turn.topic &&
      !turn.repair
    ) {
      // Lane 1: accepted answer -> warm acknowledgment + next question (Day
      // 13a). Only genuine next-questions go to the AI lanes: openings,
      // repairs and the done screen stay deterministic.
      const ai = userText
        ? await ackAndAskWithAI({ userText, base: turn.reply, lang })
        : await rephraseQuestionWithAI({ base: turn.reply, lang });
      aiLane = userText ? "ackask:" + ai.reason : ai.reason;
      if (ai.text) {
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
    } else if (
      allowAI &&
      turn.repair === true &&
      turn.topic &&
      looksLikeSmallTalk(userText)
    ) {
      // Lane 2 (Day 12): small-talk. The utterance was NOT an answer (engine
      // already wants a repair), and it looks like a greeting/thanks/filler:
      // the REAL AI answers warmly and gently re-asks the same question.
      const ai = await smallTalkWithAI({ userText, question: turn.reply, lang });
      aiLane = "smalltalk:" + ai.reason;
      if (ai.text) {
        const checked = sanitizeCandidate(
          ai.text,
          turn.topic,
          turn.profile,
          turn.reply
        );
        reply = checked.text;
        engine = checked.engine === "ai-ok" ? ai.engine : "guard-swap";
      }
    } else if (
      allowAI &&
      turn.repair === true &&
      turn.topic &&
      looksLikeUserQuestion(userText)
    ) {
      // Lane 3 (Day 13b): the beneficiary is asking US something relevant to
      // livelihood/scheme/process. The REAL AI answers inside the domain
      // truth (hopeful, never promising), then returns to the pending
      // question. Candidate is validated exactly like other lanes.
      const ai = await answerUserQuestionWithAI({
        userQuestion: userText,
        pending: turn.reply,
        lang,
      });
      aiLane = "userq:" + ai.reason;
      if (ai.text) {
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

    return NextResponse.json({
      ok: true,
      lang,
      reply,
      engine,
      aiLane,
      profile: turn.profile,
      done: turn.done,
    });
  } catch {
    // Honest floor: never brick the kiosk. Deterministic opening on any error.
    const turn = getDeterministicTurn([], "en");
    return NextResponse.json({
      ok: true,
      lang: "en",
      reply: turn.reply,
      engine: "fallback",
      aiLane: "route-error",
      profile: turn.profile,
      done: false,
    });
  }
}