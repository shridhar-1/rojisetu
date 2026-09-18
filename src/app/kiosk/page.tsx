"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LANGS, getDict, type Lang } from "@/lib/i18n";

// Beneficiary kiosk flow. Day 1 scope: language selection plus the
// conversation plan in the chosen language. The voice interview engine
// (Day 2) plugs into this same screen.
export default function KioskPage() {
  const [lang, setLang] = useState<Lang | null>(null);
  const d = getDict(lang ?? "en");

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
        {lang === null ? (
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
                  onClick={() => setLang(l.code)}
                >
                  {l.nativeName}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="card">
              <h1 className="page-title">{d.kiosk.welcome}</h1>
              <p className="page-sub">{d.kiosk.introLine}</p>

              <h2 style={{ fontSize: "1.05rem", color: "#14532d" }}>
                {d.kiosk.topicsTitle}
              </h2>
              <ol className="topic-list">
                {Object.values(d.kiosk.topics).map((topic, i) => (
                  <li key={i}>
                    <span className="topic-num">{i + 1}</span>
                    <span>{topic}</span>
                  </li>
                ))}
              </ol>

              <div className="note">{d.kiosk.comingSoon}</div>

              <div className="btn-row">
                <button
                  className="btn btn-ghost"
                  onClick={() => setLang(null)}
                >
                  {d.kiosk.changeLanguage}
                </button>
                <Link href="/" className="btn btn-ghost">
                  {d.kiosk.back}
                </Link>
              </div>
            </section>
          </>
        )}

        <footer className="app-footer">{d.footer}</footer>
      </main>
    </>
  );
}
