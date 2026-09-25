// Groq interim STT lane (Day 10-b): free-tier Whisper large-v3 hosting
// (groq.com). Activated only when BHASHINI_ keys are absent/failed and a
// GROQ_API_KEY is present. It is the middle rung of the honest ladder:
//
//   Bhashini (GoI mission, best Indic + TTS)  ->  Groq Whisper (free,
//   instant STT for all 7 kiosk languages)  ->  browser Web Speech (floor)
//
// Never throws: every failure returns ok:false with an honest reason, and
// callers fall to the next rung. The key never leaves the server.

import type { Lang } from "./i18n";

export interface GroqVoiceResult {
  ok: boolean;
  engine: string;
  text?: string;
  reason?: string;
}

export function groqEnabled(): boolean {
  return Boolean((process.env.GROQ_API_KEY ?? "").trim());
}

async function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// Whisper accepts ISO-639-1 hints; the kiosk's Lang codes are already that.
export async function groqAsr(lang: Lang, audioB64: string): Promise<GroqVoiceResult> {
  if (!groqEnabled()) return { ok: false, engine: "groq-whisper", reason: "not-configured" };
  try {
    const bytes = Buffer.from(audioB64, "base64");
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
      "voice.wav"
    );
    form.append("model", (process.env.GROQ_STT_MODEL ?? "").trim() || "whisper-large-v3");
    form.append("language", lang);
    form.append("response_format", "json");
    const res = await timedFetch(
      GROQ_STT_URL,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${(process.env.GROQ_API_KEY ?? "").trim()}` },
        body: form,
      },
      25000
    );
    if (!res.ok) return { ok: false, engine: "groq-whisper", reason: "compute-" + res.status };
    const data = (await res.json().catch(() => null)) as { text?: unknown } | null;
    const text = data && typeof data.text === "string" ? data.text.trim() : "";
    if (!text) return { ok: false, engine: "groq-whisper", reason: "empty-transcript" };
    return { ok: true, engine: "groq-whisper", text };
  } catch {
    return { ok: false, engine: "groq-whisper", reason: "compute-error" };
  }
}