// AI lanes for RojiSetu. Same pattern as MediKiosk: a per-task lane list with
// auto-failover. Keys live in Vercel env only. Failures are VISIBLE: when no
// lane answers we return a reason string (with HTTP status) so a silent
// fallback can never masquerade as success.
//
// Day 2 task: rephrase one interview question warmly in the beneficiary's
// language. Every candidate is validated by sanitizeCandidate() before a
// beneficiary sees it.

import type { Lang } from "./i18n";

export type AIEngineLabel = "ai-groq" | "ai-gemini";

export type AIResult =
  | { text: string; engine: AIEngineLabel; reason: string }
  | { text: null; engine: null; reason: string };

const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  bn: "Bengali (Bengali script)",
  kn: "Kannada (Kannada script)",
  ta: "Tamil (Tamil script)",
  te: "Telugu (Telugu script)",
  mr: "Marathi (Devanagari script)",
};

// Free-tier friendly first; older ids kept as fallbacks within each lane.
const GROQ_MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];

const SYSTEM_PROMPT = (langName: string) =>
  `You are RojiSetu, a kind livelihood assistant for rural India. ` +
  `Rewrite the interview question given by the user as ONE short, warm, ` +
  `spoken-style question in ${langName}. Rules: keep the exact same ` +
  `meaning; ask only that one question; no options, no lists, no extra ` +
  `sentences, no translator notes. Output only the question text.`;

function looksSane(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 320) return false;
  if (t.includes("\n")) return false; // one spoken line only
  return true;
}

async function laneGroq(base: string, lang: Lang): Promise<{ text: string | null; reason: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { text: null, reason: "groq:no-key" };
  let lastReason = "groq:no-attempt";
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 140,
          messages: [
            { role: "system", content: SYSTEM_PROMPT(LANG_NAMES[lang]) },
            { role: "user", content: base },
          ],
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) {
        const errText = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 140);
        lastReason = `groq:${res.status}:${errText}`;
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (looksSane(text)) return { text: text.trim(), reason: `groq:${model}` };
      lastReason = "groq:bad-output";
    } catch {
      lastReason = "groq:timeout-or-network";
    }
  }
  return { text: null, reason: lastReason };
}

async function laneGemini(base: string, lang: Lang): Promise<{ text: string | null; reason: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { text: null, reason: "gemini:no-key" };
  let lastReason = "gemini:no-attempt";
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
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
            generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
          }),
          signal: AbortSignal.timeout(7000),
        }
      );
      if (!res.ok) {
        const errText = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 140);
        lastReason = `gemini:${res.status}:${errText}`;
        continue;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (looksSane(text)) return { text: text.trim(), reason: `gemini:${model}` };
      lastReason = "gemini:bad-output";
    } catch {
      lastReason = "gemini:timeout-or-network";
    }
  }
  return { text: null, reason: lastReason };
}

/**
 * Rephrase one deterministic question via the AI lanes. Groq first, Gemini
 * second. On failure returns a readable reason (never throws) so the caller
 * ships the deterministic question and can report exactly why.
 */
export async function rephraseQuestionWithAI(opts: {
  base: string;
  lang: Lang;
}): Promise<AIResult> {
  const groq = await laneGroq(opts.base, opts.lang);
  if (groq.text) return { text: groq.text, engine: "ai-groq", reason: groq.reason };
  const gemini = await laneGemini(opts.base, opts.lang);
  if (gemini.text) return { text: gemini.text, engine: "ai-gemini", reason: gemini.reason };
  return { text: null, engine: null, reason: `${groq.reason} | ${gemini.reason}` };
}
