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

// Minimal structural types: the DOM SpeechRecognition typings are not in
// this project's TS lib, so we describe only what this page uses.
type RecognitionResultListLike = ArrayLike<{
  0: { transcript: string };
  isFinal?: boolean;
}>;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: RecognitionResultListLike }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  abort?: () => void;
  stop?: () => void;
};

// ---------------------------------------------------------------------------
// Day 9d echo filter for voice barge-in. While the bot speaks, a guarded mic
// session hears BOTH the played-back TTS and the beneficiary. We compare the
// guess with the bot's own script: heavy overlap -> self-echo (ignore);
// anything else -> a genuine interruption. Content words only (stop-words
// are stripped, so the bot's own sentence echoes match but a new answer does
// not).
// ---------------------------------------------------------------------------

const ECHO_STOP_WORDS = new Set([
  "a", "an", "the", "is", "am", "are", "was", "were", "to", "of", "in", "on",
  "and", "or", "my", "me", "i", "you", "your", "it", "he", "she", "we", "they",
  "hai", "hain", "kya", "aap", "mera", "meri", "hoon", "nahi", "haan", "ka",
  "ki", "ke", "ko", "hi", "mein", "se", "tha", "thi", "ho", "ao", "bata",
]);

function normalizeSpeech(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeEcho(userText: string, botText: string): boolean {
  const u = normalizeSpeech(userText);
  if (u.length < 3) return true; // too short to trust as an interruption
  const b = normalizeSpeech(botText);
  if (!b) return false;
  const uToks = u.split(" ").filter((w) => !ECHO_STOP_WORDS.has(w));
  if (uToks.length === 0) return true; // pure filler - ignore
  const bToks = new Set(b.split(" ").filter((w) => !ECHO_STOP_WORDS.has(w)));
  let hit = 0;
  for (const w of uToks) if (bToks.has(w)) hit++;
  return hit / uToks.length >= 0.6;
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
  const guardRef = useRef<SpeechRecognitionLike | null>(null); // barge-in session
  const guardTokenRef = useRef(0); // kills stale guard callbacks after restart
  const emptyTriesRef = useRef(0); // consecutive no-transcript mic sessions (voice-mode retry)
  const speechTokenRef = useRef(0); // guards the TTS watchdog against stale checks
  const voicePhaseRef = useRef<VoicePhase>("listening");
  useEffect(() => { voicePhaseRef.current = voicePhase; }, [voicePhase]);
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
          speakThenListen(reply.text, chosen);
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
  // Days 9b/9c hardening retained (silent/dead sessions retry with backoff;
  // TTS.onend can be lost on Android, so a watchdog forces the mic open).
  const RECONNECT_MS = [400, 900, 1600];

  // ---------- Day 9d: voice barge-in guard (speak over the bot) ----------

  function stopBargeGuard() {
    guardTokenRef.current += 1;
    const g = guardRef.current;
    guardRef.current = null;
    try {
      g?.abort?.();
    } catch {
      // no-op
    }
  }

  // Runs only while voicePhase === "speaking". Chrome ends recognition
  // sessions on its own timer, so a healthy session self-restarts (200ms)
  // until the TTS finishes and the normal chain takes over the mic.
  function startBargeGuard(botText: string, chosen: Lang) {
    stopBargeGuard();
    if (screenRef.current !== "voice" || !voiceOnRef.current) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return; // barge-in is best-effort; tapping the orb still works
    try {
      const r = new Ctor();
      guardRef.current = r;
      const token = ++guardTokenRef.current;
      r.lang = SPEECH_LANG[chosen];
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 1;
      let heard = "";
      let stableTimer: number | null = null;
      const maybeInterrupt = () => {
        if (token !== guardTokenRef.current) return;
        if (!voiceOnRef.current || screenRef.current !== "voice") return;
        if (voicePhaseRef.current !== "speaking") return;
        const t = heard.trim();
        if (t.length >= 3 && !looksLikeEcho(t, botText)) {
          // The beneficiary is talking over the bot: stop speaking NOW and
          // hand the mic to a fresh fast listener ~300ms later.
          speechTokenRef.current += 1; // retire the TTS watchdog too
          try {
            window.speechSynthesis?.cancel();
          } catch {
            // no-op
          }
          if (screenRef.current === "voice") setVoicePhase("listening");
          window.setTimeout(() => startListening(), 300);
        }
      };
      r.onresult = (ev) => {
        let s = "";
        try {
          const res = ev.results;
          for (let i = 0; i < res.length; i++) s += res[i][0].transcript;
        } catch {
          // no-op
        }
        if (!s.trim() || s === heard) return;
        heard = s;
        if (stableTimer !== null) window.clearTimeout(stableTimer);
        stableTimer = window.setTimeout(maybeInterrupt, 500); // 0.5s steady = real
      };
      r.onend = () => {
        if (token !== guardTokenRef.current) return;
        if (guardRef.current !== r) return;
        if (!voiceOnRef.current || screenRef.current !== "voice") return;
        if (voicePhaseRef.current !== "speaking") return;
        window.setTimeout(() => startBargeGuard(botText, chosen), 200);
      };
      r.onerror = () => {
        if (stableTimer !== null) window.clearTimeout(stableTimer);
      };
      try {
        r.start();
      } catch {
        // no-op
      }
    } catch {
      // barge-in unavailable on this browser: tapping the orb still interrupts
    }
  }

  // ---------- Day 9d: fast capture listening (0.9s endpointing) ----------

  function speakThenListen(text: string, chosen: Lang) {
    const token = ++speechTokenRef.current;
    const est = Math.min(12000, 500 + text.length * 75); // rough speak duration
    if (screenRef.current === "voice") startBargeGuard(text, chosen);
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
        stopBargeGuard();
        // Give the channel back to the mic before opening it (same handoff
        // delay as the normal onend chain).
        window.setTimeout(() => startListening(), 700);
      }
    }, est + 1500);
    speakReply(text, chosen, () => {
      if (!voiceOnRef.current || screenRef.current !== "voice") return;
      stopBargeGuard();
      // 650ms: Android needs the audio channel back from TTS before the mic hears.
      window.setTimeout(() => startListening(), 650);
    });
  }

  function startListening() {
    // Guards read refs: this closure may be old (fired by a TTS onend of an
    // earlier render), but decisions must use TODAY's state.
    stopBargeGuard(); // exactly one mic session at a time
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
      r.interimResults = true; // Day 9d: stream guesses so WE decide the endpoint
      r.continuous = false;
      r.maxAlternatives = 1;
      let gotResult = false;
      let transcript = "";
      let quietTimer: number | null = null;
      const clearQuiet = () => {
        if (quietTimer !== null) window.clearTimeout(quietTimer);
        quietTimer = null;
      };
      const submit = () => {
        const t = transcript.trim();
        if (!t || gotResult) return;
        gotResult = true;
        emptyTriesRef.current = 0;
        try {
          r.abort?.();
        } catch {
          // no-op
        }
        // Build the turn from historyRef (current), never closure history.
        if (langRef.current) {
          const next: Bubble[] = [
            ...historyRef.current,
            { role: "user", text: t },
          ];
          setHistory(next);
          void askServer(next, langRef.current);
        }
      };
      r.onresult = (ev) => {
        // Web Speech endpointing is conservative (Chrome can hold a silent
        // session open for 10s+). We take interim results; the moment the
        // guess stops changing for 0.9s, the answer is complete -> submit.
        let s = "";
        try {
          const res = ev.results;
          for (let i = 0; i < res.length; i++) s += res[i][0].transcript;
        } catch {
          return;
        }
        if (!s.trim() || s === transcript) return;
        transcript = s;
        clearQuiet();
        quietTimer = window.setTimeout(() => {
          try {
            r.stop?.();
          } catch {
            // no-op
          }
          submit();
        }, 900);
      };
      r.onstart = () => {
        setListening(true);
        if (screenRef.current === "voice") setVoicePhase("listening");
      };
      r.onend = () => {
        setListening(false);
        clearQuiet();
        if (!gotResult && transcript.trim()) {
          submit(); // Chrome ended with a good guess in hand: use it
          return;
        }
        // Voice-mode resilience: silent/dead sessions retry with backoff.
        if (screenRef.current === "voice" && !gotResult && emptyTriesRef.current < 4) {
          const gap = RECONNECT_MS[Math.min(emptyTriesRef.current, RECONNECT_MS.length - 1)];
          emptyTriesRef.current += 1;
          window.setTimeout(() => startListening(), gap);
        }
      };
      r.onerror = () => {
        setListening(false);
        if (!gotResult && transcript.trim()) submit();
      };
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
    stopBargeGuard();
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
    stopBargeGuard();
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
          <section className="card" aria-label={getDict("en").picker.label}>
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
                      🤝
                    </span>
                  )}
                  <span className="bubble-text">{m.text}</span>
                  {m.role === "assistant" && m.engine && (
                    <span className="engine-badge">{m.engine}</span>
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
                  <div className="chip-value">
                    {topics[t].status === "known" && topics[t].value
                      ? topics[t].value
                      : d.kiosk.review.notAnswered}
                  </div>
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
                } catch {
                  // no-op
                }
                setListening(false);
                emptyTriesRef.current = 0;
                window.setTimeout(() => startListening(), 250);
              } else if (voicePhase === "speaking") {
                // barge-in (tap): stop TTS; the chain re-opens the mic
                stopBargeGuard();
                try {
                  window.speechSynthesis?.cancel();
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