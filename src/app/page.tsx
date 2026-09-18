import Link from "next/link";
import { Logo } from "@/components/logo";
import { getDict } from "@/lib/i18n";

export default function HomePage() {
  const d = getDict("en");
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
        <div className="chips" aria-label="highlights">
          <span className="chip">PM-AJAY GIA</span>
          <span className="chip">Voice-first</span>
          <span className="chip">7 languages</span>
          <span className="chip">NSQF-aligned</span>
        </div>

        <Link href="/kiosk" className="card entry-card">
          <h2>{d.landing.beneficiary}</h2>
          <p>{d.landing.beneficiaryHint}</p>
        </Link>

        <Link href="/dashboard" className="card entry-card">
          <h2>{d.landing.official}</h2>
          <p>{d.landing.officialHint}</p>
        </Link>

        <footer className="app-footer">{d.footer}</footer>
      </main>
    </>
  );
}
