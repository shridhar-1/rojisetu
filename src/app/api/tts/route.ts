// Day 19 "human voice": server-side Sarvam Bulbul TTS.
//
// POST { text, lang } -> audio/wav bytes (a real human-sounding Indian voice).
//
// Behaviour ladder:
//   SARVAM_API_KEY set    -> Bulbul v3 voice (default speaker "shubh")
//   key missing / Sarvam down -> 204 No Content, the client falls back to the
//   browser's built-in voice, so the kiosk NEVER goes silent and no new
//   required env var is introduced.
//
// Credits are kept deliberately small: short texts, an in-memory cache (the
// fixed interview questions repeat forever but are synthesised once per
// process), and a hard character cap.

import { NextResponse } from "next/server";
import type { Lang } from "@/lib/i18n";

const SARVAM_URL = "https://api.sarvam.ai/text-to-speech";
const MODEL = "bulbul:v3";
const SPEAKER = (process.env.SARVAM_TTS_SPEAKER ?? "shubh").toLowerCase();
const MAX_CHARS = 2400; // bulbul:v3 hard limit is 2500
const CACHE_MAX = 150;

const TO_BCP47: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  kn: "kn-IN",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
};

// In-memory cache: most kiosk audio is the fixed question bank.
const cache = new Map<string, string>(); // key -> base64 wav

function cached(lang: string, text: string): string | undefined {
  const k = lang + "|" + SPEAKER + "|" + text;
  return cache.get(k);
}

function remember(lang: string, text: string, b64: string): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(lang + "|" + SPEAKER + "|" + text, b64);
}

export async function POST(req: Request) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) {
    // No key configured: nothing to do, the client speaks with the browser.
    return new NextResponse(null, { status: 204 });
  }

  let body: { text?: unknown; lang?: unknown };
  try {
    body = (await req.json()) as { text?: unknown; lang?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const lang = body.lang as Lang;
  if (!text || !TO_BCP47[lang]) {
    return NextResponse.json({ error: "need text + lang" }, { status: 400 });
  }

  const clipped = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const hit = cached(lang, clipped);
  if (hit) {
    return new NextResponse(Buffer.from(hit, "base64"), {
      status: 200,
      headers: {
        "content-type": "audio/wav",
        "cache-control": "public, max-age=3600",
      },
    });
  }

  try {
    const r = await fetch(SARVAM_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: clipped,
        language_code: TO_BCP47[lang],
        model: MODEL,
        speaker: SPEAKER,
        pace: 0.98,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      console.warn("[tts] sarvam", r.status, detail);
      return new NextResponse(null, { status: 204 }); // client falls back
    }
    const data = (await r.json()) as { audios?: unknown };
    const b64 =
      data.audios && Array.isArray(data.audios) && typeof data.audios[0] === "string"
        ? (data.audios[0] as string)
        : null;
    if (!b64) return new NextResponse(null, { status: 204 });

    remember(lang, clipped, b64);
    return new NextResponse(Buffer.from(b64, "base64"), {
      status: 200,
      headers: {
        "content-type": "audio/wav",
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.warn("[tts] sarvam unreachable:", (e as Error).message);
    return new NextResponse(null, { status: 204 }); // client falls back
  }
}
