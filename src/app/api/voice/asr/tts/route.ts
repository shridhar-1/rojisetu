import { NextRequest, NextResponse } from "next/server";
import { toLang } from "@/lib/i18n";
import { bhashiniTts, bhashiniEnabled } from "@/lib/bhashini";

export const dynamic = "force-dynamic";

const MAX_CHARS = 600;

// POST /api/voice/tts
// Body: { lang: "mr", text: "..." } -> { ok, audioB64 } (wav)
// The kiosk plays the audio and falls back to the browser SpeechSynthesis
// voice if this lane is off.
export async function POST(req: NextRequest) {
  try {
    if (!bhashiniEnabled()) {
      return NextResponse.json({ ok: false, engine: "bhashini", reason: "not-configured" });
    }
    const body = (await req.json().catch(() => ({}))) as {
      lang?: unknown;
      text?: unknown;
    };
    const lang = toLang(typeof body.text === "string" ? body.text : null);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > MAX_CHARS) {
      return NextResponse.json({ ok: false, engine: "bhashini", reason: "bad-text" });
    }
    const out = await bhashiniTts(lang, text);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ ok: false, engine: "bhashini", reason: "route-error" });
  }
}