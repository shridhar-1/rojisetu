"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OUTCOME_STATUSES } from "@/lib/outcomes";

// Per-row status picker for the official dashboard. Posts one event row via
// /api/outcomes, then refreshes the server component so the new latest
// status re-reads from the database - the page never lies from client state.
export default function OutcomeSelect({
  beneficiaryId,
  current,
}: {
  beneficiaryId: string;
  current: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(status: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiaryId, status }),
      });
      router.refresh();
    } catch {
      // honest floor: refresh snaps the select back to the stored truth
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      className="outcome-select"
      value={current}
      disabled={busy}
      aria-label="Update beneficiary status"
      onChange={(e) => void setStatus(e.target.value)}
    >
      {OUTCOME_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}