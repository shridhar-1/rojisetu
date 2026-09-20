// Outcome lifecycle for the district dashboard (Day 6).
// One vocabulary shared by the API, the dashboard, and demo rows, so a
// string can never drift between the three.
//
// Pipeline from the PS: recommended -> enrolled -> completed ->
// placed | self_employed, with dropped | needs_support possible at any
// point. Rows in `outcomes` are an EVENT LOG (every change inserts,
// keeps its timestamp); the latest row per beneficiary wins.

export const OUTCOME_STATUSES = [
  "recommended",
  "enrolled",
  "completed",
  "placed",
  "self_employed",
  "dropped",
  "needs_support",
] as const;

export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export function isOutcomeStatus(s: unknown): s is OutcomeStatus {
  return (
    typeof s === "string" &&
    (OUTCOME_STATUSES as readonly string[]).includes(s)
  );
}

// Stat-card mapping for the dashboard. Least-inflation rule, honestly
// commented: "Enrolled in training" counts people whose latest status IS
// enrolled; "Placement complete" counts placed or self-employed. Completed
// training shows on the row chip but inflates neither card.
export const ENROLLED_STATUSES: OutcomeStatus[] = ["enrolled"];
export const PLACED_STATUSES: OutcomeStatus[] = ["placed", "self_employed"];