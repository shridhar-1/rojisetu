import { NextRequest, NextResponse } from "next/server";
import { toLang } from "@/lib/i18n";
import { bhashiniAsr, bhashiniEnabled } from "@/lib/bhashini";
import { groqAsr, groqEnabled } from "@/lib/groqvoice";

export const dynamic = "force-dynamic";

const MAX_B64 = 6_000_000; // ~30s of 16kHz mono wav, generous headroom

// POST /api/voice/asr
// Body: { lang: "mr", audioB64: "<base64 wav, 16k mono>" }
// Server holds the voice keys; the browser only sees the transcript.
// Provider ladder, honest and silent:
//   1. Bhashini (GoI Dhruva)      - when BHASHINI_USER_ID + _API_KEY are set
//   2. Groq Whisper large-v3      - when GROQ_API_KEY is set
//   3. ok:false + reason          - kiosk then falls back to Web Speech
export async function POST(req: NextRequest) {
  try {
    if (!bhashiniEnabled() && !groqEnabled()) {
      return NextResponse.json({ ok: false, engine: "chain", reason: "not-configured" });
    }
    const body = (await req.json().catch(() => ({}))) as {
      lang?: unknown;
      audioB64?: unknown;
    };
    const lang = toLang(typeof body.lang === "string" ? body.lang : null);
    const audioB64 = typeof body.audioB64 === "string" ? body.audioB64 : "";
    if (!audioB64 || audioB64.length > MAX_B64) {
      return NextResponse.json({ ok: false, engine: "chain", reason: "bad-audio" });
    }
    if (bhashiniEnabled()) {
      const out = await bhashiniAsr(lang, audioB64);
      // Bhashini success, or no lower rung: report it as-is.
      if (out.ok || !groqEnabled()) return NextResponse.json(out);
    }
    if (groqEnabled()) {
      const out = await groqAsr(lang, audioB64);
      return NextResponse.json(out);
    }
    return NextResponse.json({ ok: false, engine: "chain", reason: "compute-failed" });
  } catch {
    return NextResponse.json({ ok: false, engine: "chain", reason: "route-error" });
  }
}