// RojiSetu Bhashini lane (Day 10). Server-side client for the Government of
// India's Bhashini/Dhruva pipeline: ASR (speech -> text) and TTS (text ->
// speech) in the kiosk's seven languages. The integrator key never leaves
// the server; the browser talks to /api/voice/* only.
//
// Protocol (official docs, bhashini.gitbook.io/bhashini-apis):
//   1. Pipeline Config call  -> compute endpoint URL + per-app auth header
//      + per-task service catalogue (serviceIds per language).
//   2. Compute call          -> the real task (asr with base64 wav, or tts
//      with text, returning base64 wav).
//
// Mode: bhashiniEnabled() === false when env keys are absent -> callers fall
// back to the browser Web Speech lane. Never throws; every error becomes
// ok:false with an honest reason string.

import type { Lang } from "./i18n";

const BHASHINI_CONFIG_URL =
  "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";

const DEFAULT_PIPELINE_ID = "64392f96daac500b55c543cd"; // ULCA public pipeline

export function bhashiniEnabled(): boolean {
  return Boolean(process.env.BHASHINI_USER_ID && process.env.BHASHINI_API_KEY);
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

// Default serviceIds from the public ai4bharat catalogue; dynamically
// overridden when the config call returns a fresher catalogue.
const DEFAULT_ASR_SERVICE: Record<Lang, string> = {
  en: "ai4bharat/conformer-en-gpu--t4",
  hi: "ai4bharat/conformer-hi-gpu--t4",
  bn: "ai4bharat/conformer-bn-gpu--t4",
  kn: "ai4bharat/conformer-kn-gpu--t4",
  ta: "ai4bharat/conformer-ta-gpu--t4",
  te: "ai4bharat/conformer-te-gpu--t4",
  mr: "ai4bharat/conformer-mr-gpu--t4",
};

const TTS_COQUI_INDO = "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4";
const TTS_COQUI_DRAV = "ai4bharat/indic-tts-coqui-dravidian-gpu--t4";
const TTS_COQUI_MISC = "ai4bharat/indic-tts-coqui-misc-gpu--t4";
const DEFAULT_TTS_SERVICE: Record<Lang, string> = {
  en: TTS_COQUI_MISC,
  hi: TTS_COQUI_INDO,
  bn: TTS_COQUI_INDO,
  mr: TTS_COQUI_INDO,
  kn: TTS_COQUI_DRAV,
  ta: TTS_COQUI_DRAV,
  te: TTS_COQUI_DRAV,
};

interface BhashiniConfig {
  callbackUrl: string;
  authHeaderName: string;
  authHeaderValue: string;
  asrService: Partial<Record<Lang, string>>;
  ttsService: Partial<Record<Lang, string>>;
}

let cache: { at: number; cfg: BhashiniConfig } | null = null;
const CACHE_MS = 60 * 60 * 1000;

interface BhcObj {
  [k: string]: unknown;
}

// Recursive extractor: Bhashini config payload layouts have varied between
// releases, so we walk the JSON and harvest task/service mappings defensively.
function walkJson(o: unknown, fn: (obj: BhcObj) => void): void {
  if (o === null || typeof o !== "object") return;
  if (Array.isArray(o)) {
    for (const item of o) walkJson(item, fn);
    return;
  }
  const obj = o as BhcObj;
  fn(obj);
  for (const v of Object.values(obj)) walkJson(v, fn);
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

async function getConfig(): Promise<BhashiniConfig | null> {
  if (!bhashiniEnabled()) return null;
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.cfg;
  try {
    const res = await timedFetch(
      BHASHINI_CONFIG_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          userID: env("BHASHINI_USER_ID"),
          ulcaApiKey: env("BHASHINI_API_KEY"),
        },
        body: JSON.stringify({
          pipelineTasks: [{ taskType: "asr" }, { taskType: "tts" }],
          pipelineRequestConfig: {
            pipelineId: env("BHASHINI_PIPELINE_ID") || DEFAULT_PIPELINE_ID,
          },
        }),
      },
      20000
    );
    if (!res.ok) return null;
    const data = (await res.json()) as BhcObj;

    let callbackUrl = "";
    let authName = "";
    let authValue = "";
    walkJson(data, (o) => {
      if (typeof o["callbackUrl"] === "string" && !callbackUrl) callbackUrl = o["callbackUrl"] as string;
      const key = o["inferenceApiKey"] as BhcObj | undefined;
      if (key && typeof key["name"] === "string" && typeof key["value"] === "string" && !authName) {
        authName = key["name"] as string;
        authValue = key["value"] as string;
      }
    });
    if (!callbackUrl || !authName || !authValue) return null;

    const asrService: Partial<Record<Lang, string>> = {};
    const ttsService: Partial<Record<Lang, string>> = {};
    let currentTask = "";
    walkJson(data, (o) => {
      if (typeof o["taskType"] === "string") currentTask = o["taskType"] as string;
      const sid = o["serviceId"];
      const lang = (o["language"] as BhcObj | undefined)?.["sourceLanguage"];
      if (typeof sid === "string" && typeof lang === "string") {
        const l = lang as Lang;
        if (["en", "hi", "bn", "kn", "ta", "te", "mr"].includes(l)) {
          if (currentTask === "asr") asrService[l] = sid;
          if (currentTask === "tts") ttsService[l] = sid;
        }
      }
    });

    cache = {
      at: Date.now(),
      cfg: { callbackUrl, authHeaderName: authName, authHeaderValue: authValue, asrService, ttsService },
    };
    return cache.cfg;
  } catch {
    return null;
  }
}

export interface VoiceResult {
  ok: boolean;
  engine: string; // honesty ledger prefix, e.g. "bhashini"
  text?: string;
  audioB64?: string;
  reason?: string;
}

export async function bhashiniAsr(lang: Lang, audioB64: string): Promise<VoiceResult> {
  const cfg = await getConfig();
  if (!cfg) return { ok: false, engine: "bhashini", reason: "config-failed" };
  try {
    const serviceId = cfg.asrService[lang] ?? DEFAULT_ASR_SERVICE[lang];
    const res = await timedFetch(
      cfg.callbackUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [cfg.authHeaderName]: cfg.authHeaderValue,
        },
        body: JSON.stringify({
          pipelineTasks: [
            {
              taskType: "asr",
              config: {
                language: { sourceLanguage: lang },
                serviceId,
                audioFormat: "wav",
                samplingRate: 16000,
              },
            },
          ],
          inputData: {
            input: [{ source: null }],
            audio: [{ audioContent: audioB64 }],
          },
        }),
      },
      30000
    );
    if (!res.ok) return { ok: false, engine: "bhashini", reason: "compute-" + res.status };
    const data = (await res.json()) as BhcObj;
    let text = "";
    walkJson(data, (o) => {
      if (o["taskType"] === "asr" && Array.isArray(o["output"])) {
        const first = (o["output"] as BhcObj[])[0];
        if (first && typeof first["source"] === "string" && !text) text = first["source"] as string;
      }
    });
    if (!text.trim()) return { ok: false, engine: "bhashini", reason: "empty-transcript" };
    return { ok: true, engine: "bhashini", text: text.trim() };
  } catch {
    return { ok: false, engine: "bhashini", reason: "compute-error" };
  }
}

export async function bhashiniTts(lang: Lang, text: string): Promise<VoiceResult> {
  const cfg = await getConfig();
  if (!cfg) return { ok: false, engine: "bhashini", reason: "config-failed" };
  try {
    const serviceId = cfg.ttsService[lang] ?? DEFAULT_TTS_SERVICE[lang];
    const res = await timedFetch(
      cfg.callbackUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [cfg.authHeaderName]: cfg.authHeaderValue,
        },
        body: JSON.stringify({
          pipelineTasks: [
            {
              taskType: "tts",
              config: {
                language: { sourceLanguage: lang },
                serviceId,
                gender: "female",
                audioFormat: "wav",
                samplingRate: 22050,
              },
            },
          ],
          inputData: {
            input: [{ source: text }],
            audio: [{ audioContent: null }],
          },
        }),
      },
      40000
    );
    if (!res.ok) return { ok: false, engine: "bhashini", reason: "compute-" + res.status };
    const data = (await res.json()) as BhcObj;
    let audioB64 = "";
    walkJson(data, (o) => {
      if (o["taskType"] === "tts" && Array.isArray(o["audio"])) {
        const first = (o["audio"] as BhcObj[])[0];
        if (first && typeof first["audioContent"] === "string" && !audioB64) {
          audioB64 = first["audioContent"] as string;
        }
      }
    });
    if (!audioB64) return { ok: false, engine: "bhashini", reason: "empty-audio" };
    return { ok: true, engine: "bhashini", audioB64 };
  } catch {
    return { ok: false, engine: "bhashini", reason: "compute-error" };
  }
}