import Link from "next/link";
import { Logo } from "@/components/logo";
import { LANGS, getDict, toLang } from "@/lib/i18n";
import { demoProfiles } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: { lang?: string };
};

// Official dashboard for the district corporation. Day 1 scope:
// summary stats plus a profiles table. Rows come from demo data while
// DEMO_MODE=true; real rows come from PostgreSQL once Day 2-5 land.
export default function DashboardPage({ searchParams }: Props) {
  const lang = toLang(searchParams.lang);
  const d = getDict(lang);
  const demoMode = process.env.DEMO_MODE === "true";
  const profiles = demoMode ? demoProfiles : [];

  const stats = {
    profiles: profiles.length,
    recommendations: profiles.filter((p) => p.topRecommendation).length,
    enrolled: profiles.filter((p) => p.status === "enrolled").length,
    placed: profiles.filter((p) => p.status === "placed").length,
  };

  return (
    <>
      <header className="app-header">
        <div className="container">
          <Logo size={40} />
          <div>
            <div className="brand-name">{d.appName}</div>
            <div className="brand-sub">{d.dashboard.title}</div>
          </div>
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

        <h1 className="page-title">{d.dashboard.title}</h1>
        <p className="page-sub">{d.dashboard.subtitle}</p>

        {demoMode && <div className="badge-demo">{d.dashboard.demoBanner}</div>}

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
                {profiles.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td>{p.district}</td>
                    <td>{p.education}</td>
                    <td>{p.topRecommendation}</td>
                    <td>
                      <span className={`status status-${p.status}`}>
                        {p.status}
                      </span>
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
