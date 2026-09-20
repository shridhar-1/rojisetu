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
// tap-to-fix review -> thanks. The server stays stateless; this client holds
// the conversation history and the engine recomputes the profile every turn.
// Typed text for now; the voice button lands on Day 6.

type Bubble = ChatMessage & { engine?: string };
type Screen = "picker" | "chat" | "review" | "thanks";

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
  const listRef = useRef<HTMLDivElement>(null);
  const d = getDict(lang ?? "en");

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, busy]);

  async function askServer(nextHistory: Bubble[], chosen: Lang) {
    setBusy(true);
    setError(false);
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
      setBusy(false);
      if (data.done === true) setScreen("review");
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
    setInput("");
    setError(false);
    setScreen("picker");
  }

  // Explicit beneficiary action ("Confirm and finish") = consent to save.
  // Then the engine ranks the catalogue and the thanks screen shows the
  // top-3 with reasons - recommendations are keyed to the profile, so they
  // still appear even when the database is down.
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
            <div className="chat-list" ref={listRef}>
              {history.map((m, i) => (
                <div
                  key={i}
                  className={`bubble ${
                    m.role === "assistant" ? "bubble-assistant" : "bubble-user"
                  }`}
                >
                  {m.text}
                  {m.role === "assistant" && m.engine && (
                    <span className="engine-badge">{m.engine}</span>
                  )}
                </div>
              ))}
              {busy && <div className="typing">…</div>}
            </div>

            {error && <div className="error-note">{d.kiosk.chat.retryNote}</div>}

            <div className="chat-input-row">
              <input
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
    </>
  );
}
