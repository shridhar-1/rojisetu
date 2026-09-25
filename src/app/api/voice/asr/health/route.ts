import { NextResponse } from "next/server";
import { bhashiniEnabled } from "@/lib/bhashini";
import { groqEnabled } from "@/lib/groqvoice";

export const dynamic = "force-dynamic";

// GET /api/voice/health -> { ok, bhashini, groq, server }
// Lets the kiosk choose its voice lane honestly: a server-side lane when
// integrator keys are configured on the server, browser Web Speech otherwise.
export async function GET() {
  const bhashini = bhashiniEnabled();
  const groq = groqEnabled();
  return NextResponse.json({ ok: true, bhashini, groq, server: bhashini || groq });
}