"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LANGS, getDict, type Lang } from "@/lib/i18n";
import {
  TOPIC_ORDER,
  questionForTopic,
  topicLabel,
  type ChatMessage,
  type Profile,
  type Topic,
} from "@/lib/chat-extract";
import { districtDisplay } from "@/lib/districts";

// Beneficiary kiosk flow: language picker -> voice-ready chat interview ->
// tap-to-fix review -> thanks (+ top-3 trades with reasons). Stateless
// server engine; voice drives a hands-free loop when Voice replies are ON.

type Bubble = ChatMessage & { engine?: string };
type Screen = "picker" | "chat" | "review" | "thanks" | "voice";
type VoicePhase = "listening" | "thinking" | "speaking";

// Day 5: top-3 picks shown on the thanks screen, beneficiary-visible.
type ThanksRec = {
  recommendations: {
    roleId: string;
    roleTitle: string;
    nsqfLevel: number;
    rank: number;
    reasons: string[];
  }[];
  engine: string;
};

// Day 6 voice layer. The same interview engine drives it: speech-to-text
// becomes the user turn, replies can be read out. Browser Web Speech API -
// honest support note: Chrome/Edge full, others degrade to type + read.
const SPEECH_LANG: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  kn: "kn-IN",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
};

// Minimal structural type: the DOM SpeechRecognition typings are not in
// this project's TS lib, so we describe only what this page uses.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((ev: { results: { 0: { 0: { transcript: string } } } }) => void)
    | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  abort?: () => void;
  stop?: () => void;
};

// ---------------------------------------------------------------------------
// Bhashini lane helpers (Day 10): record microphone audio, render it to
// 16kHz mono WAV, and base64-encode for the /api/voice/asr compute call.
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function blobToWavB64(blob: Blob): Promise<string> {
  const raw = await blob.arrayBuffer();
  const actx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await actx.decodeAudioData(raw);
  } finally {
    try {
      await actx.close();
    } catch {
      // no-op
    }
  }
  const RATE = 16000;
  const octx = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
  const src = octx.createBufferSource();
  src.buffer = decoded;
  src.connect(octx.destination);
  src.start();
  const rendered = await octx.startRendering();
  const pcm = rendered.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  out.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, RATE, true);
  out.setUint32(28, RATE * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  writeStr(36, "data");
  out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return bytesToBase64(new Uint8Array(out.buffer));
}

function speakReply(text: string, langCode: Lang, onend?: () => void) {
  const fireEnd = () => {
    if (onend) onend();
  };
  try {
    const synth = window.speechSynthesis;
    if (!synth) {
      fireEnd();
      return;
    }
    synth.cancel(); // never queue monotone stacking
    synth.resume?.(); // Android: cancel() can leave the queue paused - revive it
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[langCode];
    u.onend = fireEnd;
    u.onerror = fireEnd;
    const match = synth
      .getVoices()
      .find((v) => v.lang && v.lang.toLowerCase().startsWith(langCode));
    if (match) u.voice = match;
    synth.speak(u);
  } catch {
    fireEnd();
    // TTS absence is a silent no-op; the text stays readable.
  }
}

export default function KioskPage() {
  const [lang, setLang] = useState<Lang | null>(null);
  const [screen, setScreen] = useState<Screen>("picker");
  const [history, setHistory] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saveResult, setSaveResult] = useState<"saved" | "notSaved" | null>(null);
  const [recs, setRecs] = useState<ThanksRec | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceOnRef = useRef(false); // async callbacks read a ref, not state
  // Fresh-state mirrors: voice callbacks fire seconds AFTER renders, when
  // any captured state would be stale history (the "answer lands on the
  // previous question" bug). Refs hold the current truth at callback time.
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("listening");
  const historyRef = useRef<Bubble[]>([]);
  const busyRef = useRef(false);
  const listeningRef = useRef(false);
  const langRef = useRef<Lang | null>(null);
  const screenRef = useRef<Screen>("picker");
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const emptyTriesRef = useRef(0); // consecutive no-transcript mic sessions (voice-mode retry)
  const speechTokenRef = useRef(0); // guards the TTS watchdog against stale checks
  const voicePhaseRef = useRef<VoicePhase>("listening");
  useEffect(() => { voicePhaseRef.current = voicePhase; }, [voicePhase]);
  // Bhashini lane (Day 10): armed at runtime once /api/voice/health says the
  // server holds integrator keys. Browser falls back to Web Speech per call.
  const bhashiniRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/voice/health")
      .then((r) => r.json())
      .then((h) => {
        // Server lane = Bhashini when its keys exist, Groq-Whisper otherwise;
        // the provider ladder is resolved server-side per call.
        if (alive && h && (h.server === true || h.bhashini === true)) {
          bhashiniRef.current = true;
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // Warm the TTS voice list once on mount: Chrome Android speaks nothing at
  // all until voices have loaded (the classic "first reply is silent" bug).
  useEffect(() => {
    try {
      const s = window.speechSynthesis;
      if (!s) return;
      s.getVoices();
      s.onvoiceschanged = () => s.getVoices();
    } catch {
      // no-op
    }
  }, []);
  const d = getDict(lang ?? "en");

  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, busy]);

  // UX fix: the box takes focus back after every reply, so the user never
  // has to tap the message space again to keep talking.
  useEffect(() => {
    if (screen === "chat" && !busy) {
      inputRef.current?.focus();
    }
  }, [busy, screen]);

  async function askServer(nextHistory: Bubble[], chosen: Lang) {
    setBusy(true);
    setError(false);
    if (screenRef.current === "voice") setVoicePhase("thinking");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: chosen, history: nextHistory }),
      });
      const data = await res.json();
      if (!data || data.ok !== true) throw new Error("bad response");
      const reply: Bubble = {
        role: "assistant",
        text: data.reply,
        engine: data.engine,
      };
      setHistory([...nextHistory, reply]);
      setProfile(data.profile);
      const inVoice = voiceOnRef.current && screenRef.current === "voice";
      if (voiceOnRef.current) {
        // Hands-free loop: read the reply aloud, then re-open the mic. Voice
        // mode routes via speakThenListen (watchdog re-opens the mic even if
        // TTS hangs); chat hands-free keeps the plain chain.
        if (inVoice) {
          setVoicePhase("speaking");
          speakThenListen(reply.text, chosen, data.done === true);
        } else {
          speakReply(reply.text, chosen, () => {
            if (!voiceOnRef.current) return; // user navigated away mid-speech
            if (screenRef.current === "voice") {
              if (data.done) setScreen("review");
              else window.setTimeout(() => startListening(), 650);
            } else if (!data.done) {
              window.setTimeout(() => startListening(), 650);
            }
          });
        }
      }
      setBusy(false);
      // In voice mode the closing line plays first, review arrives on TTS end.
      if (data.done === true && !inVoice) setScreen("review");
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  function startInterview(chosen: Lang) {
    setLang(chosen);
    setHistory([]);
    setProfile(null);
    setScreen("chat");
    void askServer([], chosen);
  }

  function send() {
    const text = input.trim();
    if (!text || busy || lang === null) return;
    const next: Bubble[] = [...history, { role: "user", text }];
    setHistory(next);
    setInput("");
    void askServer(next, lang);
  }

  // Voice: recognised text posts as a normal user turn - the engine,
  // never-re-ask rule and review fix all behave exactly as with typing.
  // Days 9b/9c hardening:
  // - Chrome sometimes emits a FINAL result with an empty transcript, or a
  //   dead session after TTS; those are retried with backoff, never fatal.
  // - Utterance.onend can be lost (Android bug); speakThenListen arms a
  //   watchdog that re-opens the mic if speech never finishes.
  const RECONNECT_MS = [400, 900, 1600];

  // ---------- Bhashini lane: server-side GoI voice, Web Speech fallback ----------

  async function bhashiniListen() {
    if (busyRef.current || listeningRef.current || langRef.current === null) return;
    const chosen = langRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorderRef.current = rec;
      rec.start(200);
      setListening(true);
      if (screenRef.current === "voice") setVoicePhase("listening");
      // Simple RMS VAD: waits for speech, stops 1.4s after it ends (max 14s).
      const buf = new Uint8Array(analyser.fftSize);
      let voiced = false;
      let silenceMs = 0;
      let elapsed = 0;
      const STEP = 120;
      while (elapsed < 14000 && voiceOnRef.current) {
        await new Promise((r) => setTimeout(r, STEP));
        elapsed += STEP;
        if (recorderRef.current !== rec) break; // aborted (exitVoice)
        let sum = 0;
        analyser.getByteTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) {
          const d = buf[i] - 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > 7) {
          voiced = true;
          silenceMs = 0;
        } else if (voiced) {
          silenceMs += STEP;
          if (silenceMs >= 1400) break;
        }
      }
      await new Promise<void>((resolve) => {
        const prev = rec.onstop;
        rec.onstop = (ev) => {
          if (prev) prev.call(rec, ev);
          resolve();
        };
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
      stream.getTracks().forEach((t) => t.stop());
      try {
        await ctx.close();
      } catch {
        // no-op
      }
      recorderRef.current = null;
      setListening(false);
      if (!voiced || chunks.length === 0 || screenRef.current !== "voice") {
        // no speech captured: quietly re-open the mic while in voice mode
        if (screenRef.current === "voice" && voiceOnRef.current && emptyTriesRef.current < 4) {
          emptyTriesRef.current += 1;
          window.setTimeout(() => startListening(), 500);
        }
        return;
      }
      const wavB64 = await blobToWavB64(new Blob(chunks, { type: rec.mimeType }));
      const res = await fetch("/api/voice/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: chosen, audioB64: wavB64 }),
      });
      const out = (await res.json().catch(() => null)) as {
        ok?: boolean;
        text?: string;
      } | null;
      const text = out && out.ok && typeof out.text === "string" ? out.text.trim() : "";
      if (text && langRef.current) {
        emptyTriesRef.current = 0;
        const next: Bubble[] = [...historyRef.current, { role: "user", text }];
        setHistory(next);
        void askServer(next, langRef.current);
      } else if (screenRef.current === "voice" && voiceOnRef.current) {
        // ASR miss: re-open the mic so the user can simply say it again.
        emptyTriesRef.current = 0;
        window.setTimeout(() => startListening(), 500);
      }
    } catch {
      setListening(false);
      recorderRef.current = null;
      if (screenRef.current === "voice" && voiceOnRef.current && emptyTriesRef.current < 4) {
        emptyTriesRef.current += 1;
        window.setTimeout(() => startListening(), 600);
      }
    }
  }

  async function bhashiniSpeakThenListen(text: string, chosen: Lang, afterDone = false) {
    const token = ++speechTokenRef.current;
    // Watchdog: if nothing plays/ends within the estimate, force the mic.
    const est = Math.min(15000, 2500 + text.length * 90);
    window.setTimeout(() => {
      if (
        voiceOnRef.current &&
        screenRef.current === "voice" &&
        speechTokenRef.current === token &&
        voicePhaseRef.current === "speaking"
      ) {
        try {
          audioElRef.current?.pause();
        } catch {
          // no-op
        }
        audioElRef.current = null;
        if (afterDone) {
          window.setTimeout(() => setScreen("review"), 700);
        } else {
          window.setTimeout(() => startListening(), 400);
        }
      }
    }, est);
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: chosen, text }),
      });
      const out = (await res.json().catch(() => null)) as {
        ok?: boolean;
        audioB64?: string;
      } | null;
      if (out && out.ok && typeof out.audioB64 === "string") {
        if (speechTokenRef.current !== token || screenRef.current !== "voice") return;
        const fire = () => {
          audioElRef.current = null;
          if (voiceOnRef.current && screenRef.current === "voice") {
            if (afterDone) {
              window.setTimeout(() => setScreen("review"), 500);
            } else {
              window.setTimeout(() => startListening(), 450);
            }
          }
        };
        const audio = new Audio("data:audio/wav;base64," + out.audioB64);
        audioElRef.current = audio;
        audio.onended = fire;
        audio.onerror = fire;
        await audio.play().catch(() => fire());
        return;
      }
      throw new Error("tts-lane-failed");
    } catch {
      // Per-call fallback to the browser voice; the chain itself is protected
      // by speakReply's onerror/utterance watchdogs.
      speakReply(text, chosen, () => {
        if (!voiceOnRef.current || screenRef.current !== "voice") return;
        if (afterDone) {
          window.setTimeout(() => setScreen("review"), 600);
          return;
        }
        window.setTimeout(() => startListening(), 650);
      });
    }
  }

  // afterDone: this is the interview CLOSING line - speak it, then land on
  // the review screen instead of reopening the mic.
  function speakThenListen(text: string, chosen: Lang, afterDone = false) {
    if (bhashiniRef.current) {
      void bhashiniSpeakThenListen(text, chosen, afterDone);
      return;
    }
    const token = ++speechTokenRef.current;
    const est = Math.min(12000, 500 + text.length * 75); // rough speak duration
    window.setTimeout(() => {
      if (
        voiceOnRef.current &&
        screenRef.current === "voice" &&
        speechTokenRef.current === token &&
        voicePhaseRef.current === "speaking"
      ) {
        try {
          window.speechSynthesis?.cancel();
          window.speechSynthesis?.resume?.();
        } catch {
          // no-op
        }
        if (afterDone) {
          window.setTimeout(() => setScreen("review"), 900);
        } else {
          // Give the channel back to the mic before opening it (same handoff
          // delay as the normal onend chain).
          window.setTimeout(() => startListening(), 700);
        }
      }
    }, est + 1500);
    speakReply(text, chosen, () => {
      if (!voiceOnRef.current || screenRef.current !== "voice") return;
      if (afterDone) {
        window.setTimeout(() => setScreen("review"), 600);
        return;
      }
      // 650ms: Android needs the audio channel back from TTS before the mic hears.
      window.setTimeout(() => startListening(), 650);
    });
  }

  function startListening() {
    if (bhashiniRef.current) {
      void bhashiniListen();
      return;
    }
    // Guards read refs: this closure may be old (fired by a TTS onend of an
    // earlier render), but decisions must use TODAY's state.
    if (busyRef.current || listeningRef.current || langRef.current === null) return;
    const chosen = langRef.current;
    try {
      // never listen while talking (only cancel when genuinely speaking -
      // cancelling an idle queue is the Android dead-utterance trigger)
      if (voicePhaseRef.current === "speaking") window.speechSynthesis?.cancel();
    } catch {
      // no-op
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceNote(true);
      return;
    }
    try {
      const r = new Ctor();
      recogRef.current = r;
      r.lang = SPEECH_LANG[chosen];
      r.interimResults = false;
      r.maxAlternatives = 1;
      let gotResult = false;
      r.onresult = (ev) => {
        const t = ev.results?.[0]?.[0]?.transcript ?? "";
        // Empty finals happen (Chrome); treat them like a no-result session.
        if (!t.trim()) return;
        gotResult = true;
        emptyTriesRef.current = 0;
        // Build the turn from historyRef (current), never closure history.
        if (langRef.current) {
          const next: Bubble[] = [
            ...historyRef.current,
            { role: "user", text: t.trim() },
          ];
          setHistory(next);
          void askServer(next, langRef.current);
        }
      };
      r.onstart = () => {
        setListening(true);
        if (screenRef.current === "voice") setVoicePhase("listening");
      };
      r.onend = () => {
        setListening(false);
        // Voice-mode resilience: silent/dead sessions retry with backoff.
        if (screenRef.current === "voice" && !gotResult && emptyTriesRef.current < 4) {
          const gap = RECONNECT_MS[Math.min(emptyTriesRef.current, RECONNECT_MS.length - 1)];
          emptyTriesRef.current += 1;
          window.setTimeout(() => startListening(), gap);
        }
      };
      r.onerror = () => setListening(false);
      r.start();
    } catch {
      setVoiceNote(true);
    }
  }

  // Voice mode (Day 7c): immersive full screen, Gemini-style. Entering it
  // implies voice replies ON for the duration; leaving restores the chat.
  function enterVoice() {
    if (langRef.current === null) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceNote(true);
      return;
    }
    voiceOnRef.current = true;
    setVoiceOn(true);
    emptyTriesRef.current = 0;
    setScreen("voice");
    // Speak the pending question FIRST: when replies were typed-only (voice
    // replies off), the beneficiary has not heard the question yet. The mic
    // opens when the speech ends. If a reply is already in flight, listen.
    const lastA = [...historyRef.current].reverse().find((m) => m.role === "assistant");
    const lastIsUser =
      historyRef.current.length > 0 &&
      historyRef.current[historyRef.current.length - 1].role === "user";
    const chosen = langRef.current;
    if (lastA && !lastIsUser && chosen && lastA.text.length >= 4) {
      setVoicePhase("speaking");
      speakThenListen(lastA.text, chosen);
    } else {
      setVoicePhase("listening");
      window.setTimeout(() => startListening(), 180);
    }
  }

  function exitVoice() {
    try {
      recogRef.current?.abort?.();
      recogRef.current?.stop?.();
    } catch {
      // no-op
    }
    try {
      recorderRef.current?.stop();
      recorderRef.current = null;
    } catch {
      // no-op
    }
    try {
      audioElRef.current?.pause();
      audioElRef.current = null;
    } catch {
      // no-op
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // no-op
    }
    voiceOnRef.current = false;
    setVoiceOn(false);
    setListening(false);
    setScreen("chat");
  }

  function toggleVoice() {
    voiceOnRef.current = !voiceOnRef.current;
    setVoiceOn(voiceOnRef.current);
  }

  // Review screen tap-to-fix: ask that one question again inside the chat.
  // markTopic() on the engine overwrites the value and logs a warning when
  // the answer actually changed, exactly like a mid-interview correction.
  function reask(topic: Topic) {
    if (lang === null) return;
    const q: Bubble = {
      role: "assistant",
      text: questionForTopic(topic, lang),
      engine: "deterministic",
    };
    setHistory([...history, q]);
    setScreen("chat");
  }

  function startOver() {
    setLang(null);
    setHistory([]);
    setProfile(null);
    setSaveResult(null);
    setRecs(null);
    setListening(false);
    setVoiceNote(false);
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // no-op
    }
    setInput("");
    setError(false);
    setScreen("picker");
  }

  // Explicit beneficiary action ("Confirm and finish") = consent to save.
  // Then the engine ranks the catalogue and the thanks screen shows the
  // top-3 with reasons - recommendations are keyed to the profile, so they
  // still appear even when the database is down (stored:false surfaces in
  // the API, the beneficiary story stays whole).
  async function finishInterview() {
    if (lang === null) {
      setScreen("thanks");
      return;
    }
    let beneficiaryId: string | null = null;
    try {
      const res = await fetch("/api/beneficiaries/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          profile,
          transcript: history.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      setSaveResult(data && data.saved === true ? "saved" : "notSaved");
      beneficiaryId =
        data && typeof data.id === "string" ? (data.id as string) : null;
    } catch {
      setSaveResult("notSaved");
    }
    try {
      const rres = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, profile, beneficiaryId }),
      });
      const rec = await rres.json();
      if (rec && rec.ok === true && Array.isArray(rec.recommendations)) {
        setRecs({ recommendations: rec.recommendations, engine: rec.engine });
      }
    } catch {
      // Honest floor: thanks screen stands without recommendations.
    }
    setScreen("thanks");
  }

  const topics = profile ? profile.topics : null;
  const answeredCount = topics
    ? TOPIC_ORDER.filter((t) => topics[t].status === "known").length
    : 0;
  const lastAssistant =
    [...history].reverse().find((m) => m.role === "assistant")?.text ?? "";
  // Day 11: canonical district for chips - the registry's native-script
  // spelling in the current language, never a transliterated guess.
  const chipValue = (t: Topic): string => {
    const st = topics ? topics[t] : null;
    if (!st || st.status !== "known") return d.kiosk.review.notAnswered;
    if (t === "district" && st.canonical) {
      return districtDisplay(st.canonical, lang ?? "en");
    }
    return st.value ?? d.kiosk.review.notAnswered;
  };

  return (
    <>
      <header className="app-header">
        <div className="container">
          <Logo size={40} />
          <div>
            <div className="brand-name">{d.appName}</div>
            <div className="brand-sub">{d.tagline}</div>
          </div>
        </div>
      </header>

      <main className="container">
        {screen === "picker" && (
          <section className="card picker-card" aria-label={getDict("en").picker.label}>
            <div className="picker-hero" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/saathi.jpg" alt="" className="picker-saathi" />
            </div>
            <h1 className="page-title">
              {LANGS.map((l) => l.nativeName).join(" · ")}
            </h1>
            <p className="page-sub">{getDict("en").picker.label}</p>
            <div className="lang-grid">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  className="lang-btn"
                  onClick={() => startInterview(l.code)}
                >
                  {l.nativeName}
                </button>
              ))}
            </div>
          </section>
        )}

        {screen === "chat" && (
          <section className="card">
            <div className="progress-label">{answeredCount} / {TOPIC_ORDER.length}</div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${(answeredCount / TOPIC_ORDER.length) * 100}%` }}
              />
            </div>
            <div className="chat-list" ref={listRef}>
              {history.map((m, i) => (
                <div
                  key={i}
                  className={`bubble ${
                    m.role === "assistant" ? "bubble-assistant" : "bubble-user"
                  }`}
                >
                  {m.role === "assistant" && (
                    <span className="bubble-avatar" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/saathi.jpg" alt="" className="avatar-img" />
                    </span>
                  )}
                  <span className="bubble-text">{m.text}</span>
                  {m.role === "assistant" && m.engine && (
                    <span className="engine-badge">
                      {m.engine.startsWith("ai-") ? m.engine : "RojiSetu AI"}
                    </span>
                  )}
                </div>
              ))}
              {busy && <div className="typing">…</div>}
            </div>

            {error && <div className="error-note">{d.kiosk.chat.retryNote}</div>}
            {voiceNote && (
              <div className="voice-note">{d.kiosk.chat.voiceUnsupported}</div>
            )}

            <div className="chat-input-row">
              <button
                className={`btn btn-ghost btn-voice${listening ? " mic-active" : ""}`}
                onClick={startListening}
                disabled={busy || listening}
                aria-label={d.kiosk.chat.micSpeak}
                title={d.kiosk.chat.micSpeak}
              >
                🎤
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder={d.kiosk.chat.typePlaceholder}
                disabled={busy}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={send}
                disabled={busy || !input.trim()}
              >
                {d.kiosk.chat.send}
              </button>
            </div>

            <div className="btn-row">
              <button className="btn btn-primary btn-voice-cta" onClick={enterVoice}>
                🎙 {d.kiosk.voice.startVoice}
              </button>
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={toggleVoice} title={d.kiosk.chat.micSpeak}>
                {voiceOn ? d.kiosk.chat.soundOn : d.kiosk.chat.soundOff}
              </button>
              <button className="btn btn-ghost" onClick={startOver}>
                {d.kiosk.changeLanguage}
              </button>
            </div>
          </section>
        )}

        {screen === "review" && topics && (
          <section className="card">
            <h1 className="page-title">{d.kiosk.review.title}</h1>
            <p className="page-sub">{d.kiosk.review.note}</p>

            {profile && profile.warnings.length > 0 && (
              <div className="warn-box">
                {profile.warnings.map((w, i) => (
                  <div key={i}>
                    <strong>{topicLabel(w.topic, lang ?? "en")}</strong>:{" "}
                    {d.kiosk.review.warning}{" "}
                    <em>
                      &ldquo;{w.previous}&rdquo; → &ldquo;{w.latest}&rdquo;
                    </em>
                  </div>
                ))}
              </div>
            )}

            <div className="chip-grid">
              {TOPIC_ORDER.map((t) => (
                <button key={t} className="fix-chip" onClick={() => reask(t)}>
                  <div className="chip-topic">{topicLabel(t, lang ?? "en")}</div>
                  <div className="chip-value">{chipValue(t)}</div>
                </button>
              ))}
            </div>

            <div className="btn-row">
              <button
                className="btn btn-primary"
                onClick={() => void finishInterview()}
              >
                {d.kiosk.review.finish}
              </button>
              <button className="btn btn-ghost" onClick={startOver}>
                {d.kiosk.review.startOver}
              </button>
            </div>
          </section>
        )}

        {screen === "thanks" && (
          <section className="card">
            <h1 className="page-title">{d.kiosk.review.thanksTitle}</h1>
            {saveResult && (
              <p className="page-sub">{d.kiosk.review.saveState[saveResult]}</p>
            )}
            <p className="page-sub">{d.kiosk.review.thanksNote}</p>

            {recs && recs.recommendations.length > 0 && (
              <div className="rec-list">
                <h2 className="rec-head">{d.kiosk.review.recsTitle}</h2>
                {recs.recommendations.map((r) => (
                  <div key={r.roleId} className="rec-item">
                    <div className="rec-title">
                      {r.rank}. {r.roleTitle}
                      <span className="rec-level">
                        {d.kiosk.review.recsLevelLabel} {r.nsqfLevel}
                      </span>
                    </div>
                    <ul className="rec-why">
                      {r.reasons.map((why, j) => (
                        <li key={j}>{why}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="btn-row">
              <button className="btn btn-ghost" onClick={startOver}>
                {d.kiosk.review.startOver}
              </button>
              <Link href="/" className="btn btn-ghost">
                {d.kiosk.back}
              </Link>
            </div>
          </section>
        )}

        <footer className="app-footer">{d.footer}</footer>
      </main>

      {screen === "voice" && (
        <section className="voice-stage" aria-label={d.kiosk.voice.startVoice}>
          <div className="voice-status">
            {voicePhase === "listening"
              ? d.kiosk.voice.statusListening
              : voicePhase === "thinking"
                ? d.kiosk.voice.statusThinking
                : d.kiosk.voice.statusSpeaking}
          </div>

          <button
            className={`voice-orb ${voicePhase}`}
            onClick={() => {
              if (voicePhase === "listening") {
                // hard reset: abort the current session and re-open the mic
                try {
                  recogRef.current?.abort?.();
                  recorderRef.current?.stop();
                } catch {
                  // no-op
                }
                setListening(false);
                emptyTriesRef.current = 0;
                window.setTimeout(() => startListening(), 250);
              } else if (voicePhase === "speaking") {
                // barge-in: stop any voice lane; the chain re-opens the mic
                try {
                  window.speechSynthesis?.cancel();
                  audioElRef.current?.pause();
                } catch {
                  // no-op
                }
                speechTokenRef.current += 1;
                window.setTimeout(() => startListening(), 250);
              } else {
                startListening(); // thinking: guarded by busyRef anyway
              }
            }}
            aria-label={d.kiosk.chat.micSpeak}
          >
            <span className="voice-ring r1" />
            <span className="voice-ring r2" />
            <span className="voice-ring r3" />
            <span className="voice-orb-core">
              {voicePhase === "thinking" ? "⏳" : voicePhase === "speaking" ? "🔊" : "🎤"}
            </span>
          </button>

          {lastAssistant && <div className="voice-subtitle">{lastAssistant}</div>}

          <button className="btn btn-ghost voice-exit" onClick={exitVoice}>
            ✕ {d.kiosk.voice.exitVoice}
          </button>
        </section>
      )}
    </>
  );
}