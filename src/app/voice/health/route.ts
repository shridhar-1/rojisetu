import { NextResponse } from "next/server";
import { bhashiniEnabled } from "@/lib/bhashini";

export const dynamic = "force-dynamic";

// GET /api/voice/health -> { ok, bhashini }
// Lets the kiosk choose its voice lane honestly: Bhashini when integrator
// keys are configured on the server, browser Web Speech otherwise.
export async function GET() {
  return NextResponse.json({ ok: true, bhashini: bhashiniEnabled() });
}