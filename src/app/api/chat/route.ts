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
// digit, anything long, and anything not in the lexicon is left alone.
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
// Day 13/14: what the BENEFICIARY says back falls into three buckets.
//
//  A. answers   -> the engine consumes them (strict or free-text topics).
//  B. objections/questions to the ASSISTANT ("nan en madbeku?", "yake
//     helbeku?", "why this survey?") -> CONVERSATION, never an answer. They
//     must not be recorded: free-text topics would otherwise happily store
//     "why should I tell you?" as the family occupation. The strip below
//     removes them from the history the engine sees, EVERY turn, so the
//     profile (and the review screen, which mirrors it) can never contain
//     an objection masquerading as data.
//  C. chit-chat -> greetings/thanks/filler, likewise conversation only.
//
// Detector design: tight on purpose. A trailing "?" needs a real question
// word beside it (speech recognisers sometimes hang a "?" on a genuine
// answer), digit-led short utterances are always answers ("8th std?" in any
// script's digits), and everything speaks through small phrase lexicons in
// the seven kiosk languages + transliteration.
// ---------------------------------------------------------------------------

const ANY_DIGIT =
  /[0-9\u0966-\u096f\u09e6-\u09ef\u0ae6-\u0aef\u0b66-\u0b6f\u0be6-\u0bef\u0c66-\u0c6f\u0ce6-\u0cef]/;

const QUESTION_WORDS: string[] = [
  // english / transliteration
  "why", "what", "who", "how", "when", "yake", "yenu", "hege", "yavaga",
  "yelli", "madbeku", "maadbeku", "sigutte", "sigutta", "sikkodu", "gottu",
  "kya", "kyun", "kaise", "kab", "milega", "milegi", "batau", "bataye",
  "keno", "kibhabe", "pabo", "eppadi", "sollo", "enduku", "ela",
  // devanagari (hi/mr)
  "क्या", "क्यों", "कैसे", "कब", "मिलेगा", "मिलेगी", "बताऊं", "काय", "कसा",
  "कसं", "कशाला",
  // kannada
  "ಏಕೆ", "ಯಾಕೆ", "ಏನು", "ಹೇಗೆ", "ಯಾವಾಗ", "ಎಲ್ಲಿ", "ಮಾಡಬೇಕು", "ಸಿಗುತ್ತ",
  "ಗೊತ್ತಿಲ್ಲ",
  // bengali
  "কেন", "কীভাবে", "কখন", "পাবো",
  // tamil
  "ஏன்", "என்ன", "எப்படி", "எப்போது", "கிடைக்கும்",
  // telugu
  "ఎందుకు", "ఏమిటి", "ఎలా", "ఎప్పుడు", "లభిస్తుంది",
];

// Speakable objections that need no question mark: "why should I tell you",
// "why this survey", "what will I get" - in the kiosk languages.
const INTERJECTION_PHRASES: string[] = [
  // english / transliteration
  "why should i tell", "why should i say", "why do you need", "what will i get",
  "why this survey", "who are you", "what is this",
  "yake helbeku", "yakee helbeku", "yake madta", "yake madbeku", "yake guru",
  "helbeku", "enu sigutte", "nanage enu", "kyun batau", "kya milega",
  "mujhe kya milega", "kashala sangu", "kay milel", "ken bolbo", "ki pabo",
  "enduku cheppali", "emi labhistundi", "enaku enna",
  // kannada
  "ಹೇಳಬೇಕು", "ಏಕೆ ಹೇಳಬೇಕು", "ಯಾಕೆ ಹೇಳಬೇಕು", "ಯಾಕೆ ಮಾಡ್ತಾ", "ಏಕೆ ಮಾಡ್ತಾ",
  "ಯಾಕೆ ಮಾಡುತ್ತ", "ಏನು ಸಿಗುತ್ತ", "ನನಗೆ ಏನು", "ಈ ಸರ್ವೇನ ಯಾಕೆ", "ಯಾಕೆ ಈ ಸರ್ವೇ",
  // devanagari (hi/mr)
  "क्यों बताऊं", "क्यों बताएं", "क्या मिलेगा", "मुझे क्या मिलेगा",
  "काशाला सांगायचं", "काय मिळेल",
  // bengali
  "কেন বলবো", "কী পাবো",
  // tamil
  "ஏன் சொல்ல", "என்ன கிடைக்கும்", "எனக்கு என்ன",
  // telugu
  "ఎందుకు చెప్పాలి", "ఏమి లభిస్తుంది", "నాకు ఏమి",
];

function looksLikeInterjection(raw0: string): boolean {
  const raw = raw0.trim().toLowerCase();
  if (!raw || raw.length > 140) return false;
  // digit-led short utterances are answers (class/ordinal), never questions
  if (ANY_DIGIT.test(raw) && raw.length <= 14) return false;
  const t = raw.replace(/[.!,।;:]+/g, " ").replace(/\s+/g, " ").trim();
  const hasQWord = QUESTION_WORDS.some((w) => t.includes(w));
  if ((raw.endsWith("?") || raw.endsWith("？")) && hasQWord) return true;
  for (const p of INTERJECTION_PHRASES) {
    if (t.includes(p)) return true;
  }
  return false;
}

// Day-13 lane detector (kept as the BACKSTOP for repair turns): question-like
// utterances aimed at a STRICT topic (e.g. education) trigger the engine's
// repair path instead of being recorded; this still recognises them so the
// AI answers instead of just re-asking.
const USER_QUESTION_TERMS: string[] = [
  // english / transliteration
  "what", "why", "how", "when", "will i", "should i", "can i", "do i", "is it",
  "madbeku", "maadbeku", "madbeka", "beku", "yake", "yenu", "hege", "yelli",
  "yavaga", "barutha", "sigutta", "sigutha", "sikkodu", "sikkitava",
  "kya hai", "kaise", "kyun", "kyoon", "kab", "milega", "milegi", "hoga",
  "hogi", "karna", "kya kar", "kab tak", "why govt", "this scheme",
  // domain words (short utterances only)
  "job", "jobs", "training", "scheme", "yojana", "sarkar", "government",
  "govt", "pm-ajay", "ajay", "certificate", "salary", "paisa", "money",
  // devanagari (hi/mr)
  "क्या", "क्यों", "कैसे", "कब", "मिलेगा", "मिलेगी", "होगा", "होगी", "करना",
  "नौकरी", "काम", "प्रशिक्षण", "योजना", "सरकार", "काय", "कसा", "कसे", "करायचं",
  "कशाला",
  // kannada
  "ಏನು", "ಯಾವ", "ಏಕೆ", "ಹೇಗೆ", "ಬೇಕು", "ಮಾಡಬೇಕು", "ಸಿಗುತ್ತೆ", "ಬರೆ", "ಇಲ್ಲಿ",
  "ಕೆಲಸ", "ನೌಕರಿ", "ತರಬೇತಿ", "ಯೋಜನೆ", "ಸರ್ಕಾರ",
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

// Conversation (greetings + objections) is stripped from the history the
// engine sees. Stateless-safe: the same filter runs every turn, so the
// recomputed profile is stable - an objection can never sit in the profile
// even though it stays visible in the chat bubbles.
function stripConversation(history: ChatMessage[]): ChatMessage[] {
  return history.filter(
    (m) =>
      !(
        m.role === "user" &&
        (looksLikeSmallTalk(m.text) || looksLikeInterjection(m.text))
      )
  );
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

    // Classify the last utterance: answer vs objection-to-us vs chit-chat.
    const small = userText !== "" && looksLikeSmallTalk(userText);
    const interj = !small && userText !== "" && looksLikeInterjection(userText);

    // The engine only ever sees answers: conversation is stripped first, so
    // free-text topics can never record an objection as the beneficiary's
    // answer (this profile feeds the review screen directly).
    const engineHistory = stripConversation(history);

    const turn = getDeterministicTurn(engineHistory, lang);
    let reply = turn.reply;
    let engine: string = turn.engine;
    let aiLane = "skipped:" + turn.replyKind;

    if (allowAI && turn.topic && small) {
      // Lane 2 (Day 12+14): small-talk. The REAL AI answers warmly and
      // gently re-asks the pending question. Fires whether or not the
      // greeting addressed a strict or free-text topic.
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
    } else if (allowAI && turn.topic && interj) {
      // Lane 3 (Day 13b+14): the beneficiary is asking US something. The AI
      // answers inside the domain truth (hopeful, never promising), then
      // returns to the pending question. The objection was stripped above,
      // so the profile stays clean and the topic is still open.
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
    } else if (
      allowAI &&
      turn.replyKind === "question" &&
      turn.topic &&
      !turn.repair
    ) {
      // Lane 1: accepted answer -> warm acknowledgment + next question (Day
      // 13a). Only genuine next-questions go to the AI: openings (no user
      // answer yet), repairs and the done screen stay deterministic.
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
      looksLikeUserQuestion(userText)
    ) {
      // Backstop (Day 13b): a question-like utterance that survived the strip
      // (unusual phrasing) and hit a STRICT topic's repair path still gets a
      // real answer instead of a bare re-ask.
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