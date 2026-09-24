import { NextRequest, NextResponse } from "next/server";
import { toLang } from "@/lib/i18n";
import { bhashiniAsr, bhashiniEnabled } from "@/lib/bhashini";

export const dynamic = "force-dynamic";

const MAX_B64 = 6_000_000; // ~30s of 16kHz mono wav, generous headroom

// POST /api/voice/asr
// Body: { lang: "mr", audioB64: "<base64 wav, 16k mono>" }
// Server holds the Bhashini key; the browser only sees the transcript.
// ok:false always carries an honest reason - the kiosk falls back to the
// Web Speech lane, never to silence.
export async function POST(req: NextRequest) {
  try {
    if (!bhashiniEnabled()) {
      return NextResponse.json({ ok: false, engine: "bhashini", reason: "not-configured" });
    }
    const body = (await req.json().catch(() => ({}))) as {
      lang?: unknown;
      audioB64?: unknown;
    };
    const lang = toLang(typeof body.lang === "string" ? body.lang : null);
    const audioB64 = typeof body.audioB64 === "string" ? body.audioB64 : "";
    if (!audioB64 || audioB64.length > MAX_B64) {
      return NextResponse.json({ ok: false, engine: "bhashini", reason: "bad-audio" });
    }
    const out = await bhashiniAsr(lang, audioB64);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ ok: false, engine: "bhashini", reason: "route-error" });
  }
}