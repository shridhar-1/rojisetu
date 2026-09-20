// AI lanes for RojiSetu. Same pattern as MediKiosk: a per-task lane list with
// auto-failover. Keys live in Vercel env only. Failures are VISIBLE: when no
// lane answers we return a reason string (with HTTP status and the provider's
// error body) so a silent fallback can never masquerade as success.
//
// Lane order: Groq -> Gemini -> OpenRouter -> deterministic floor.
// All three are OpenAI-compatible chat endpoints with our own free-signup
// keys (ToS-compliant services only).
//
// Day 2 task: rephrase one interview question warmly in the beneficiary's
// language. Every candidate is validated by sanitizeCandidate() before a
// beneficiary sees it.
//
// Day 4: the three lanes now also serve arbitrary JSON-ish tasks through
// runAICustomTask() (same cascade, same failover, custom system prompt +
// validator). rephraseQuestionWithAI keeps its exact Day-2 behaviour.

import type { Lang } from "./i18n";

export type AIEngineLabel = "ai-groq" | "ai-gemini" | "ai-openrouter";

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

// Free/developer-tier first. Verified against this account's /models list
// on 2026-09-18: gpt-oss-20b, gpt-oss-120b, qwen3.8-27b are callable;
// llama-3.1/3.3 remain only as tier fallbacks.
const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash"];
// OpenRouter rotates its free roster monthly. Defaults verified 2026-09-18;
// override anytime with the OPENROUTER_MODEL env var (id from openrouter.ai/models).
const OPENROUTER_DEFAULT_MODELS = ["google/gemma-4-31b-it:free", "qwen/qwen3.8-27b:free", "nvidia/nemotron-3-super-120b-a12b:free"];

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

// Per-task overrides; defaults reproduce the Day-2 rephrase behaviour.
export interface LaneTask {
  system?: string;
  user: string;
  maxTokens?: number;
  validate?: (text: string) => boolean;
}

function taskSystem(task: LaneTask, lang: Lang): string {
  return task.system ?? SYSTEM_PROMPT(LANG_NAMES[lang]);
}
function taskValidate(task: LaneTask): (t: string) => boolean {
  return task.validate ?? looksSane;
}

async function laneGroq(task: LaneTask, lang: Lang): Promise<{ text: string | null; reason: string }> {
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
          max_tokens: task.maxTokens ?? 140,
          messages: [
            { role: "system", content: taskSystem(task, lang) },
            { role: "user", content: task.user },
          ],
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) {
        const errText = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
        lastReason = `groq:${res.status}:${errText}`;
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (taskValidate(task)(text)) return { text: text.trim(), reason: `groq:${model}` };
      lastReason = "groq:bad-output";
    } catch {
      lastReason = "groq:timeout-or-network";
    }
  }
  return { text: null, reason: lastReason };
}

async function laneGemini(task: LaneTask, lang: Lang): Promise<{ text: string | null; reason: string }> {
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
                parts: [{ text: taskSystem(task, lang) + "\n\n" + task.user }],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: task.maxTokens ?? 240,
            },
          }),
          signal: AbortSignal.timeout(7000),
        }
      );
      if (!res.ok) {
        const errText = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
        lastReason = `gemini:${res.status}:${errText}`;
        continue;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (taskValidate(task)(text)) return { text: text.trim(), reason: `gemini:${model}` };
      lastReason = "gemini:bad-output";
    } catch {
      lastReason = "gemini:timeout-or-network";
    }
  }
  return { text: null, reason: lastReason };
}

async function laneOpenRouter(task: LaneTask, lang: Lang): Promise<{ text: string | null; reason: string }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { text: null, reason: "openrouter:no-key" };
  const override = process.env.OPENROUTER_MODEL;
  const models = override ? [override, ...OPENROUTER_DEFAULT_MODELS] : OPENROUTER_DEFAULT_MODELS;
  let lastReason = "openrouter:no-attempt";
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://rojisetu.vercel.app",
          "X-Title": "RojiSetu",
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: task.maxTokens ?? 140,
          messages: [
            { role: "system", content: taskSystem(task, lang) },
            { role: "user", content: task.user },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const errText = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
        lastReason = `openrouter:${res.status}:${errText}`;
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (taskValidate(task)(text)) return { text: text.trim(), reason: `openrouter:${model}` };
      lastReason = "openrouter:bad-output";
    } catch {
      lastReason = "openrouter:timeout-or-network";
    }
  }
  return { text: null, reason: lastReason };
}

/**
 * Rephrase one deterministic question via the AI lanes.
 * Groq -> Gemini -> OpenRouter -> null (deterministic floor ships).
 * On failure returns readable reasons (never throws).
 */
export async function rephraseQuestionWithAI(opts: {
  base: string;
  lang: Lang;
}): Promise<AIResult> {
  const task: LaneTask = { user: opts.base };
  const groq = await laneGroq(task, opts.lang);
  if (groq.text) return { text: groq.text, engine: "ai-groq", reason: groq.reason };
  const gemini = await laneGemini(task, opts.lang);
  if (gemini.text) return { text: gemini.text, engine: "ai-gemini", reason: gemini.reason };
  const openrouter = await laneOpenRouter(task, opts.lang);
  if (openrouter.text) return { text: openrouter.text, engine: "ai-openrouter", reason: openrouter.reason };
  return {
    text: null,
    engine: null,
    reason: `${groq.reason} | ${gemini.reason} | ${openrouter.reason}`,
  };
}

/**
 * Generic Day-4 task runner. Same cascade (Groq -> Gemini -> OpenRouter ->
 * null), same failover, but the CALLER owns the system prompt and validator.
 * Used by the recommendation ranker; validators should check strict JSON.
 */
export async function runAICustomTask(opts: {
  task: LaneTask;
  lang: Lang;
}): Promise<AIResult> {
  const groq = await laneGroq(opts.task, opts.lang);
  if (groq.text) return { text: groq.text, engine: "ai-groq", reason: groq.reason };
  const gemini = await laneGemini(opts.task, opts.lang);
  if (gemini.text) return { text: gemini.text, engine: "ai-gemini", reason: gemini.reason };
  const openrouter = await laneOpenRouter(opts.task, opts.lang);
  if (openrouter.text) return { text: openrouter.text, engine: "ai-openrouter", reason: openrouter.reason };
  return {
    text: null,
    engine: null,
    reason: `${groq.reason} | ${gemini.reason} | ${openrouter.reason}`,
  };
}