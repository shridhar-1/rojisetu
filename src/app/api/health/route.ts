import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Post-deploy smoke test: curl this after every push.
// It reports which env vars are PRESENT, never their values.
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "rojisetu",
    build: "day1-scaffold",
    time: new Date().toISOString(),
    env: {
      database: Boolean(process.env.DATABASE_URL),
      groq: Boolean(process.env.GROQ_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      demoMode: process.env.DEMO_MODE === "true",
    },
  });
}
