// Recommendation engine for RojiSetu (Day 4).
//
// Pattern rule carried from MediKiosk: a DETERMINISTIC FLOOR runs first and
// is subtractive only (roles that fail a floor are removed and COUNTED, so
// the system can honestly say "N roles need more schooling than you said").
// The AI lane may RE-RANK and phrase reasons, never create eligibility.
//
// Honesty contract:
//  - Education floor applies only when chat-extract produced a canonical
//    value. "none" is a real answer (never studied) and DOES apply.
//    Un-parseable free text = unknown = no floor, never a guess.
//  - Mobility floor applies only on an explicit no-travel phrase
//    (detectNoTravel); unclear text never constrains.
//  - Districts in the catalogue are demand examples, not eligibility.
//  - Every response carries floorsApplied + excluded + aiLane, and each role
//    keeps catalogue `indicative` semantics (levels/floors are indicative).

import type { Lang } from "./i18n";
import {
  EDU_SCORE,
  NSQF_ROLES,
  meetsEducation,
  type NsqfRole,
} from "./nsqf-catalog";

// ---------------------------------------------------------------- facts

interface TopicShape {
  status?: unknown;
  value?: unknown;
  canonical?: unknown;
}

export type RecTopics = Record<string, TopicShape>;

export interface RecFacts {
  educationCanonical: string | null;
  educationText: string | null;
  skillsInterests: string | null;
  familyOccupation: string | null;
  currentLivelihood: string | null;
  mobility: string | null;
  preference: "self" | "wage" | "either" | null;
  district: string | null;
}

function knownValue(t: TopicShape | undefined): string | null {
  if (!t || t.status !== "known" || typeof t.value !== "string") return null;
  const v = t.value.trim();
  return v ? v.slice(0, 400) : null;
}

function knownCanonical(t: TopicShape | undefined): string | null {
  if (!t || t.status !== "known" || typeof t.canonical !== "string") return null;
  const v = t.canonical.trim();
  return v ? v.slice(0, 40) : null;
}

function normPreference(canonical: string | null, raw: string | null): RecFacts["preference"] {
  const s = (canonical ?? raw ?? "").toLowerCase();
  if (s.includes("self") || s.includes("own")) return "self";
  if (s.includes("wage") || s.includes("job")) return "wage";
  if (s.includes("either")) return "either";
  return null;
}

export function buildFacts(topics: RecTopics): RecFacts {
  return {
    educationCanonical: knownCanonical(topics.education),
    educationText: knownValue(topics.education),
    skillsInterests: knownValue(topics.skillsInterests),
    familyOccupation: knownValue(topics.familyOccupation),
    currentLivelihood: knownValue(topics.currentLivelihood),
    mobility: knownValue(topics.mobility),
    preference: normPreference(
      knownCanonical(topics.workPreference),
      knownValue(topics.workPreference)
    ),
    district: knownValue(topics.district),
  };
}

// ---------------------------------------------------------------- floors

// Small honest phrase list: English + Devanagari no-travel indicators.
// False negatives simply skip the floor (floors are subtractive, so a miss
// never wrongly excludes anything).
const NO_TRAVEL_PHRASES = [
  "cannot travel",
  "can't travel",
  "can not travel",
  "cannot go far",
  "stay at home",
  "from home only",
  "no travel",
  "घर से बाहर नहीं",
  "बाहर नहीं जा",
  "घर पर ही",
  "दूर नहीं",
  "नहीं जा सकती",
  "नहीं जा सकता",
  "गाँव छोड़",
];

export function detectNoTravel(mobilityText: string | null): boolean {
  if (!mobilityText) return false;
  const t = mobilityText.toLowerCase();
  return NO_TRAVEL_PHRASES.some((p) => t.includes(p));
}

export interface FloorReport {
  applied: { education: boolean; mobility: boolean; preference: boolean };
  excluded: { education: number; mobility: number; preference: number };
}

export function applyFloors(
  facts: RecFacts,
  noTravel: boolean
): { kept: NsqfRole[]; report: FloorReport } {
  const excluded = { education: 0, mobility: 0, preference: 0 };
  let kept = NSQF_ROLES.slice();

  // Floor applies only on a canonical the catalogue understands. An
  // unmapped canonical = unknown = no floor (never guess against a person).
  const eduKnown =
    facts.educationCanonical !== null && facts.educationCanonical in EDU_SCORE;
  if (eduKnown) {
    const c = facts.educationCanonical as string;
    kept = kept.filter((r) => {
      const ok = meetsEducation(c, r.minEducation);
      if (!ok) excluded.education++;
      return ok;
    });
  }
  if (noTravel) {
    kept = kept.filter((r) => {
      if (!r.workFromHomeOk) excluded.mobility++;
      return r.workFromHomeOk;
    });
  }
  if (facts.preference === "self" || facts.preference === "wage") {
    const ok = facts.preference === "self" ? ["self", "either"] : ["wage", "either"];
    kept = kept.filter((r) => {
      const fits = ok.includes(r.preferenceFit);
      if (!fits) excluded.preference++;
      return fits;
    });
  }
  return {
    kept,
    report: {
      applied: {
        education: eduKnown,
        mobility: noTravel,
        preference: facts.preference === "self" || facts.preference === "wage",
      },
      excluded,
    },
  };
}

// ---------------------------------------------------------------- scoring

export interface RankedRole {
  role: NsqfRole;
  score: number;
  matched: string[];
}

function keywordMatched(corpus: string, tokens: Set<string>, kw: string): boolean {
  const k = kw.toLowerCase();
  if (k.includes(" ")) return corpus.includes(k);
  // pure-ASCII single words match whole tokens only (kills "shop"~"workshop")
  if (/^[a-z-]+$/.test(k)) return tokens.has(k);
  return corpus.includes(k); // Indic / mixed tokens match by substring
}

export function rankRoles(kept: NsqfRole[], facts: RecFacts): RankedRole[] {
  const corpus = [
    facts.skillsInterests,
    facts.currentLivelihood,
    facts.familyOccupation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const tokens = new Set(corpus.split(/[^\p{L}\p{N}]+/u).filter(Boolean));

  const ranked: RankedRole[] = kept.map((role) => {
    const matched = role.keywords
      .filter((k) => keywordMatched(corpus, tokens, k))
      .slice(0, 3);
    return { role, score: matched.length, matched };
  });

  // Deterministic order: keyword strength, then lower entry barrier
  // (NSQF level), then id — stable and explainable, no hidden signal.
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.role.nsqfLevel !== b.role.nsqfLevel)
      return a.role.nsqfLevel - b.role.nsqfLevel;
    return a.role.id < b.role.id ? -1 : 1;
  });
  return ranked;
}

// ------------------------------------------------- deterministic reasons

export function deterministicReasons(
  ranked: RankedRole,
  facts: RecFacts,
  noTravel: boolean
): string[] {
  const out: string[] = [];
  if (ranked.matched.length > 0) {
    out.push(`Matches what you told us about your work: "${ranked.matched[0]}".`);
  }
  if (facts.educationCanonical !== null && facts.educationText) {
    out.push(
      `Your schooling (${facts.educationText}) fits this role's entry level (indicative).`
    );
  }
  if (facts.preference && ranked.role.preferenceFit === facts.preference) {
    out.push(`Fits your preference for ${facts.preference} work.`);
  }
  if (noTravel && ranked.role.workFromHomeOk) {
    out.push(`Can be done from or near home, as you asked.`);
  }
  if (out.length === 0) {
    out.push(`A low-entry-barrier trade you can start in your district.`);
  }
  return out.slice(0, 2);
}

// ------------------------------------------------------- AI pick contract

export interface AIPick {
  id: string;
  reason: string;
}

function extractJson(text: string): string | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  return text.slice(a, b + 1);
}

/** Strict parse; returns null on ANY contract break. */
export function parseAIPicks(text: string, allowedIds: string[]): AIPick[] | null {
  try {
    const raw = extractJson(text);
    if (!raw) return null;
    const data = JSON.parse(raw) as { picks?: unknown };
    if (!Array.isArray(data.picks) || data.picks.length < 1 || data.picks.length > 3)
      return null;
    const out: AIPick[] = [];
    for (const p of data.picks as { id?: unknown; reason?: unknown }[]) {
      if (
        typeof p?.id !== "string" ||
        !allowedIds.includes(p.id) ||
        typeof p?.reason !== "string"
      ) {
        return null;
      }
      const reason = p.reason.trim().replace(/\s+/g, " ");
      if (reason.length < 10 || reason.length > 260) return null;
      out.push({ id: p.id, reason });
    }
    return out;
  } catch {
    return null;
  }
}

export function makePicksValidator(allowedIds: string[]) {
  return (text: string) => parseAIPicks(text, allowedIds) !== null;
}

// ------------------------------------------------------- AI prompt (built)

export const AI_LANG_NAMES: Record<Lang, string> = {
  en: "English",
  hi: "Hindi (Devanagari)",
  bn: "Bengali",
  kn: "Kannada",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi (Devanagari)",
};

export function recommendSystemPrompt(lang: Lang): string {
  return (
    `You are the ranking step of RojiSetu, a livelihood assistant that has ` +
    `already filtered roles deterministically. Choose the THREE most fitting ` +
    `roles for this candidate from the shortlist ONLY, best first. ` +
    `For each pick give ONE short, warm reason in ${AI_LANG_NAMES[lang]}, ` +
    `spoken style, using ONLY the facts provided. ` +
    `Never invent facts, ages, scheme names, subsidies or amounts. Never pick ` +
    `an id that is not in the shortlist. ` +
    `Reply ONLY with JSON of the exact shape: ` +
    `{"picks":[{"id":"role-id","reason":"one sentence"}]}`
  );
}

export function recommendUserPayload(facts: RecFacts, shortlist: RankedRole[]): string {
  return JSON.stringify({
    candidate: {
      education: facts.educationText,
      skillsInterests: facts.skillsInterests,
      familyOccupation: facts.familyOccupation,
      currentLivelihood: facts.currentLivelihood,
      mobilityNote: facts.mobility,
      prefers: facts.preference,
    },
    shortlist: shortlist.map((r) => ({
      id: r.role.id,
      title: r.role.roleTitle,
      sector: r.role.sector,
      nsqfLevel: r.role.nsqfLevel,
      matchedBackgroundKeyword: r.matched[0] ?? null,
    })),
  });
}

// -------------------------------------------------------------- assembly

export interface RecItem {
  roleId: string;
  roleTitle: string;
  sector: NsqfRole["sector"];
  nsqfLevel: number;
  minEducation: NsqfRole["minEducation"];
  rank: number;
  reasons: string[];
}

export interface DeterministicResult {
  recommendations: RecItem[];
  shortlistIds: string[];
  ranked: RankedRole[];
  report: FloorReport;
  facts: RecFacts;
  noTravel: boolean;
}

/** Runs floors + ranking; the route then decides AI-vs-deterministic. */
export function runDeterministicStage(topics: RecTopics): DeterministicResult {
  const facts = buildFacts(topics);
  const noTravel = detectNoTravel(facts.mobility);
  const { kept, report } = applyFloors(facts, noTravel);
  const ranked = rankRoles(kept, facts);
  const shortlist = ranked.slice(0, 10);
  const top3 = shortlist.slice(0, 3);
  const recommendations: RecItem[] = top3.map((r, i) => ({
    roleId: r.role.id,
    roleTitle: r.role.roleTitle,
    sector: r.role.sector,
    nsqfLevel: r.role.nsqfLevel,
    minEducation: r.role.minEducation,
    rank: i + 1,
    reasons: deterministicReasons(r, facts, noTravel),
  }));
  return {
    recommendations,
    shortlistIds: shortlist.map((r) => r.role.id),
    ranked: shortlist,
    report,
    facts,
    noTravel,
  };
}

/** Merge validated AI picks back onto full role data (pick order = rank). */
export function aiPicksToItems(
  picks: AIPick[],
  shortlist: RankedRole[]
): RecItem[] {
  return picks.map((p, i) => {
    const r = shortlist.find((x) => x.role.id === p.id)!;
    return {
      roleId: r.role.id,
      roleTitle: r.role.roleTitle,
      sector: r.role.sector,
      nsqfLevel: r.role.nsqfLevel,
      minEducation: r.role.minEducation,
      rank: i + 1,
      reasons: [p.reason],
    };
  });
}