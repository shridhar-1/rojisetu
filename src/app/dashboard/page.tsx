import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Logo } from "@/components/logo";
import OutcomeSelect from "@/components/OutcomeSelect";
import { LANGS, getDict, toLang } from "@/lib/i18n";
import { demoProfiles, type DemoProfile } from "@/lib/demo-data";
import { ENROLLED_STATUSES, PLACED_STATUSES, isOutcomeStatus } from "@/lib/outcomes";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: { lang?: string };
};

// Day 6: real rows carry their beneficiary id so the official can move the
// pipeline per row; demo rows have none and stay read-only.
type Row = DemoProfile & { beneficiaryId?: string };

// Official dashboard for the district corporation. Day 3: reads real
// beneficiary rows when the database is attached; falls back to demo rows
// (DEMO_MODE) or the honest empty state otherwise. Light payload: the list
// carries no transcripts, matching the MediKiosk list-API pattern rule.
export default async function DashboardPage({ searchParams }: Props) {
  const lang = toLang(searchParams.lang);
  const d = getDict(lang);
  const demoMode = process.env.DEMO_MODE === "true";

  let realRows: Row[] = [];
  let dbLive = false;
  const db = getDb();
  if (db) {
    try {
      const rows = await db
        .select({
          id: schema.beneficiaries.id,
          lang: schema.beneficiaries.lang,
          education: schema.beneficiaries.education,
          district: schema.beneficiaries.district,
        })
        .from(schema.beneficiaries)
        .orderBy(desc(schema.beneficiaries.createdAt))
        .limit(20);
      dbLive = true;

      // Day 5: top recommendation per beneficiary = the rank-1 row the
      // engine stored. Recommendation-less interviews honestly stay "-".
      // Inner try: a join failure must never hide the beneficiary list.
      const topRec: Record<string, string> = {};
      try {
        if (rows.length > 0) {
          const recs = await db
            .select({
              beneficiaryId: schema.recommendations.beneficiaryId,
              roleTitle: schema.recommendations.roleTitle,
            })
            .from(schema.recommendations)
            .where(
              and(
                eq(schema.recommendations.rank, 1),
                inArray(
                  schema.recommendations.beneficiaryId,
                  rows.map((r) => r.id)
                )
              )
            );
          for (const r of recs) topRec[r.beneficiaryId] = r.roleTitle;
        }
      } catch {
        // recommendations column stays "-"
      }

      // Day 6: latest outcome status per beneficiary (joined verbally, not
      // in SQL, so a broken outcomes table never breaks the roster).
      const latestStatus: Record<string, string> = {};
      try {
        if (rows.length > 0) {
          const events = await db
            .select({
              beneficiaryId: schema.outcomes.beneficiaryId,
              status: schema.outcomes.status,
              updatedAt: schema.outcomes.updatedAt,
            })
            .from(schema.outcomes)
            .where(
              inArray(
                schema.outcomes.beneficiaryId,
                rows.map((r) => r.id)
              )
            )
            .orderBy(desc(schema.outcomes.updatedAt));
          for (const e of events) {
            // first occurrence in desc order = latest
            if (!(e.beneficiaryId in latestStatus))
              latestStatus[e.beneficiaryId] = e.status;
          }
        }
      } catch {
        // keep empty; statuses default to "recommended"
      }

      realRows = rows.map((b): Row => {
        const ls = latestStatus[b.id];
        return {
          name: `Profile ${b.id.slice(0, 6)}`,
          district: b.district ?? "-",
          education: b.education ?? "-",
          topRecommendation: topRec[b.id] ?? "-",
          status: isOutcomeStatus(ls) ? ls : "recommended",
          beneficiaryId: b.id,
        };
      });
    } catch {
      dbLive = false;
    }
  }

  const useReal = realRows.length > 0;
  const profiles: Row[] = useReal ? realRows : demoMode ? demoProfiles : [];
  const demoBanner = !useReal && demoMode;

  const stats = {
    profiles: profiles.length,
    recommendations: profiles.filter((p) => p.topRecommendation !== "-").length,
    enrolled: profiles.filter((p) => ENROLLED_STATUSES.includes(p.status)).length,
    placed: profiles.filter((p) => PLACED_STATUSES.includes(p.status)).length,
  };

  return (
    <>
      {/* tricolor ribbon + ministry strip: same chrome as the landing */}
      <div className="tricolor" aria-hidden="true">
        <span className="tricolor-saffron" />
        <span className="tricolor-white" />
        <span className="tricolor-green" />
      </div>
      <div className="govt-strip">
        <div className="container govt-strip-in">
          <span>Ministry of Social Justice &amp; Empowerment</span>
          <span className="govt-strip-dot" aria-hidden="true">
            •
          </span>
          <span>PM-AJAY — Grant-in-Aid</span>
          <span className="govt-strip-right">District dashboard</span>
        </div>
      </div>

      <header className="app-header home-header">
        <div className="container">
          <Logo size={44} />
          <div>
            <div className="brand-name">{d.appName}</div>
            <div className="brand-sub">{d.dashboard.title}</div>
          </div>
          <nav className="home-nav">
            <Link href="/" className="home-nav-link">
              Home
            </Link>
            <Link href="/kiosk" className="home-nav-link">
              Voice Kiosk
            </Link>
          </nav>
        </div>
      </header>

      <main className="container">
        <nav className="lang-strip" aria-label={d.picker.label}>
          {LANGS.map((l) => (
            <Link
              key={l.code}
              href={`/dashboard?lang=${l.code}`}
              className={l.code === lang ? "active" : ""}
            >
              {l.nativeName}
            </Link>
          ))}
        </nav>

        {/* mission banner: the district office at work */}
        <section className="dash-hero">
          <div className="dash-hero-copy">
            <h1 className="page-title">{d.dashboard.title}</h1>
            <p className="page-sub">{d.dashboard.subtitle}</p>
            {demoBanner && <div className="badge-demo">{d.dashboard.demoBanner}</div>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="dash-hero-img"
            src="/dashboard.png"
            alt="District official reviewing livelihood pipeline with trained beneficiaries"
          />
        </section>

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-value">{stats.profiles}</div>
            <div className="stat-label">{d.dashboard.profiles}</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stats.recommendations}</div>
            <div className="stat-label">{d.dashboard.recommendations}</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stats.enrolled}</div>
            <div className="stat-label">{d.dashboard.enrolled}</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stats.placed}</div>
            <div className="stat-label">{d.dashboard.placed}</div>
          </div>
        </div>

        <h2 style={{ fontSize: "1.05rem", color: "#14532d", margin: "8px 0" }}>
          {d.dashboard.recentProfiles}
        </h2>

        {profiles.length === 0 ? (
          <div className="card">
            <p>{d.dashboard.empty}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{d.dashboard.colName}</th>
                  <th>{d.dashboard.colDistrict}</th>
                  <th>{d.dashboard.colEducation}</th>
                  <th>{d.dashboard.colRecommendation}</th>
                  <th>{d.dashboard.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => (
                  <tr key={p.name + i}>
                    <td>{p.name}</td>
                    <td>{p.district}</td>
                    <td>{p.education}</td>
                    <td>{p.topRecommendation}</td>
                    <td>
                      <span className={`status status-${p.status}`}>
                        {p.status}
                      </span>
                      {p.beneficiaryId && (
                        <OutcomeSelect
                          beneficiaryId={p.beneficiaryId}
                          current={p.status}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="btn-row">
          <Link href="/" className="btn btn-ghost">
            {d.dashboard.backHome}
          </Link>
        </div>

        <footer className="app-footer">{d.footer}</footer>
      </main>
    </>
  );
}