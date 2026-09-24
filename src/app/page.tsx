import Link from "next/link";
import { Logo } from "@/components/logo";
import { getDict } from "@/lib/i18n";

// Day 15 landing: a real "skill mission" face for RojiSetu - tricolor ribbon,
// ministry strip, illustrated hero ( beneficiaries crossing the setu from
// village to livelihood ), stats, how-it-works, trades from the catalogue,
// and the two entries (voice kiosk for beneficiaries, dashboard for
// officials). The landing is English-led by design (Kiosk carries all 7
// languages); a Kannada hero line keeps the home flavour.
export default function HomePage() {
  const d = getDict("en");
  return (
    <>
      {/* tricolor ribbon - instantly reads "Government of India" */}
      <div className="tricolor" aria-hidden="true">
        <span className="tricolor-saffron" />
        <span className="tricolor-white" />
        <span className="tricolor-green" />
      </div>

      {/* ministry strip, like a real scheme portal */}
      <div className="govt-strip">
        <div className="container govt-strip-in">
          <span>Ministry of Social Justice &amp; Empowerment</span>
          <span className="govt-strip-dot" aria-hidden="true">
            •
          </span>
          <span>PM-AJAY — Grant-in-Aid</span>
          <span className="govt-strip-right">Team EcoLogic · SIH 2026</span>
        </div>
      </div>

      <header className="app-header home-header">
        <div className="container">
          <Logo size={44} />
          <div>
            <div className="brand-name">{d.appName}</div>
            <div className="brand-sub">{d.tagline}</div>
          </div>
          <nav className="home-nav">
            <Link href="/kiosk" className="home-nav-link">
              Voice Kiosk
            </Link>
            <Link href="/dashboard" className="home-nav-link">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="hero container">
          <div className="hero-copy">
            <span className="hero-eyebrow">
              🎙️ Voice-first livelihood assistant
            </span>
            <h1 className="hero-title">
              ಮಾತನಾಡಿ — ದಾರಿ ನಾವು ಹುಡುಕುತ್ತೇವೆ.
              <span className="hero-title-en">
                Speak in your language. We find your way to a livelihood.
              </span>
            </h1>
            <p className="hero-sub">
              RojiSetu listens like a friend, asks seven short questions, and
              suggests NSQF-aligned training and livelihood options under
              PM-AJAY — hopeful guidance, honest outcomes, no literacy
              required.
            </p>
            <div className="hero-cta">
              <Link href="/kiosk" className="btn-hero btn-hero-primary">
                🎙️ Start the voice interview
              </Link>
              <Link href="/dashboard" className="btn-hero btn-hero-ghost">
                📊 Officials dashboard
              </Link>
            </div>
            <div className="chips" aria-label="highlights">
              <span className="chip">PM-AJAY Grant-in-Aid</span>
              <span className="chip">7 languages</span>
              <span className="chip">NSQF-aligned</span>
              <span className="chip">Works on a simple phone</span>
            </div>
          </div>

          <figure className="hero-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero.jpg"
              alt="Beneficiaries - a tailor, an electrician, a farmer and a graduate - crossing the bridge from village to livelihood"
            />
            <figcaption className="hero-art-badge">
              <span className="hero-art-badge-avatar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/saathi.jpg" alt="" />
              </span>
              <span>
                <strong>Saathi</strong> — your voice assistant
                <br />
                <small>asks · listens · guides</small>
              </span>
            </figcaption>
          </figure>
        </section>

        {/* STATS */}
        <section className="container stats-strip" aria-label="facts">
          <div className="stat">
            <div className="stat-num">7</div>
            <div className="stat-label">Indian languages</div>
          </div>
          <div className="stat">
            <div className="stat-num">7</div>
            <div className="stat-label">gentle questions</div>
          </div>
          <div className="stat">
            <div className="stat-num">3</div>
            <div className="stat-label">ranked options, with reasons</div>
          </div>
          <div className="stat">
            <div className="stat-num">0</div>
            <div className="stat-label">reading or typing needed</div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="container">
          <h2 className="section-title">How RojiSetu works</h2>
          <p className="section-sub">
            Built for a panchayat kiosk, a shared family phone, or a camp
            tablet — the beneficiary just talks.
          </p>
          <div className="steps">
            <div className="step-card">
              <div className="step-icon" aria-hidden="true">
                🎙️
              </div>
              <h3>1 · Speak freely</h3>
              <p>
                Questions are read aloud in the beneficiary&apos;s language;
                answers are spoken back — even with hesitation, even in mixed
                words.
              </p>
            </div>
            <div className="step-card">
              <div className="step-icon" aria-hidden="true">
                🤖
              </div>
              <h3>2 · Saathi understands</h3>
              <p>
                A deterministic interview engine checks every answer; the AI
                only adds warmth — acknowledging replies, answering doubts —
                and never invents facts.
              </p>
            </div>
            <div className="step-card">
              <div className="step-icon" aria-hidden="true">
                🎯
              </div>
              <h3>3 · A way forward</h3>
              <p>
                The catalogue is ranked to the person&apos;s answers and the
                top-3 NSQF-aligned options are shown with the reasons why.
              </p>
            </div>
          </div>
        </section>

        {/* TRADES */}
        <section className="container">
          <h2 className="section-title">Livelihoods we guide towards</h2>
          <div className="trades" aria-label="trade catalogue">
            <span className="trade">🧵 Tailoring</span>
            <span className="trade">⚡ Electrical work</span>
            <span className="trade">☀️ Solar technician</span>
            <span className="trade">🥛 Dairy &amp; livestock</span>
            <span className="trade">🌾 Agri &amp; food processing</span>
            <span className="trade">🧱 Masonry</span>
            <span className="trade">🚗 Driving</span>
            <span className="trade">💅 Beauty &amp; wellness</span>
            <span className="trade">🧺 Handicrafts</span>
            <span className="trade">🛠️ Repair services</span>
          </div>
        </section>

        {/* ENTRIES */}
        <section className="container entries">
          <Link href="/kiosk" className="entry-card-big entry-beneficiary">
            <div className="entry-emoji" aria-hidden="true">
              🎙️
            </div>
            <div className="entry-text">
              <h2>{d.landing.beneficiary}</h2>
              <p>{d.landing.beneficiaryHint}</p>
            </div>
            <span className="entry-arrow" aria-hidden="true">
              →
            </span>
          </Link>

          <Link href="/dashboard" className="entry-card-big entry-official">
            <div className="entry-emoji" aria-hidden="true">
              📊
            </div>
            <div className="entry-text">
              <h2>{d.landing.official}</h2>
              <p>{d.landing.officialHint}</p>
            </div>
            <span className="entry-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </section>

        <footer className="container app-footer home-footer">
          {d.footer}
        </footer>
      </main>
    </>
  );
}