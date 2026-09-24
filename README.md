# RojiSetu

The livelihood bridge. An AI voice assistant for livelihood mapping and
NSQF-aligned skilling under PM-AJAY (Grant-in-Aid), Ministry of Social
Justice and Empowerment.

SIH 2026, problem statement SIH 26097. Team EcoLogic (Team ID ******).

The people this scheme serves often cannot read a form. But every one of
them can speak. RojiSetu holds a short, empathetic voice conversation in
the beneficiary's own language, builds a structured livelihood profile,
and recommends NSQF-aligned training with reasons. District officials get
a dashboard for perspective-plan gaps and post-training outcomes.

## Stack

- Next.js 14 (App Router) + TypeScript strict
- Drizzle ORM + PostgreSQL (`postgres` driver)
- AI lanes (same pattern as our MediKiosk engine): Ollama local -> Groq -> Gemini
- 7 languages: English, Hindi, Bengali, Kannada, Tamil, Telugu, Marathi

## Local run (PowerShell)

```powershell
npm install
copy-item .env.example .env    # then fill values locally, never commit
npm run typecheck
npm run dev
```

Open http://localhost:3000

## Database

Additive changes only, same rule as MediKiosk:

```powershell
npx drizzle-kit push
```

## Environment variables

Set in Vercel project settings, never in code or git:

- `DATABASE_URL`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `DEMO_MODE` = `true`

## After every deploy

```powershell
curl.exe https://<your-app>.vercel.app/api/health
```

Expect `{"ok":true,"app":"rojisetu",...}` with all four `env` flags true.
