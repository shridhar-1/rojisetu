// AI lanes for RojiSetu. Same pattern as MediKiosk: a per-task lane list with
// auto-failover. Keys live in Vercel env only. Every function returns null on
// failure so callers fall back to the deterministic floor honestly.
//
// Day 2 task: rephrase one interview question warmly in the beneficiary's
// language. The candidate is ALWAYS validated by sanitizeCandidate() in
// chat-extract.ts before it reaches a beneficiary.

import type { Lang } from "./i18n";

export type AIEngineLabel = "ai-groq" | "ai-gemini";

const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  bn: "Bengali (Bengali script)",
  kn: "Kannada (Kannada script)",
  ta: "Tamil (Tamil script)",
  te: "Telugu (Telugu script)",
  mr: "Marathi (Devanagari script)",
};

const SYSTEM_PROMPT = (langName: string) =>
  `You are RojiSetu, a kind livelihood assistant for rural India. ` +
  `Rewrite the interview question given by the user as ONE short, warm, ` +
  `spoken-style question in ${langName}. Rules: keep the exact same ` +
  `meaning; ask only that one question; no options, no lists, no extra ` +
  `sentences, no English. Output only the question text.`;

function looksSane(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 320) return false;
  if (t.includes("\n")) return false; // one spoken line only
  return true;
}

async function laneGroq(base: string, lang: Lang): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 140,
      messages: [
        { role: "system", content: SYSTEM_PROMPT(LANG_NAMES[lang]) },
        { role: "user", content: base },
      ],
    }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return looksSane(text) ? text.trim() : null;
}

async function laneGemini(base: string, lang: Lang): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
      encodeURIComponent(key),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: SYSTEM_PROMPT(LANG_NAMES[lang]) + "\n\n" + base }],
          },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 140 },
      }),
      signal: AbortSignal.timeout(7000),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return looksSane(text) ? text.trim() : null;
}

/**
 * Rephrase one deterministic question via the AI lanes.
 * Groq first, Gemini second. Null when both are unreachable or their
 * output fails sanity checks — the caller then ships the deterministic
 * question instead. Never throws.
 */
export async function rephraseQuestionWithAI(opts: {
  base: string;
  lang: Lang;
}): Promise<{ text: string; engine: AIEngineLabel } | null> {
  try {
    const groq = await laneGroq(opts.base, opts.lang);
    if (groq) return { text: groq, engine: "ai-groq" };
  } catch {
    // lane down, try next
  }
  try {
    const gemini = await laneGemini(opts.base, opts.lang);
    if (gemini) return { text: gemini, engine: "ai-gemini" };
  } catch {
    // both lanes down
  }
  return null;
}
