/**
 * The conflict rules for one feature→capability link, shared by the server's
 * recompute and the browser data client so the two can never disagree.
 */

/** Everything the conflict rules need about one live link, joined up. */
export type ConflictInputs = {
  link_id: number
  pwc_feature_id: string
  capability_id: number
  matched: number
  feature_release_id: string
  feature_phase_id: string
  feature_phase_label: string | null
  capability_release_id: string | null
  capability_phase_id: string | null
  capability_phase_label: string | null
  release_conflict: number
  phase_conflict: number
  phase_conflict_merged: number
}

/**
 * Conflict flags after a placement changes.
 *
 * The import derives these once from the two documents. Nothing recomputed
 * them afterwards, so moving a capability or a feature through the UI left
 * every flag as the import had written it — the map kept reporting a conflict
 * the move had just settled, or missed one the move had just created.
 *
 * The rules here mirror `reconcile.ts` exactly and are asserted against it:
 * recomputing every link straight after an import must change nothing.
 */
export type LinkConflictFlags = {
  release_conflict: number
  phase_conflict: number
  phase_conflict_merged: number
  feature_release_id: string | null
  capability_release_id: string | null
  feature_phase_label: string | null
  capability_phase_label: string | null
}

const sameLabel = (a: string | null, b: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/**
 * The conflict a single link carries. Pure, so it can be tested against the
 * reconciler's own output without a database.
 *
 * A release conflict is a difference in release id. A phase conflict is a
 * difference in the *source labels*, not the canonical phase ids — that is
 * what keeps the canonical merge visible instead of hiding it — and it counts
 * as merged when both labels resolve to the same canonical phase.
 */
export function deriveLinkConflict(input: ConflictInputs): LinkConflictFlags {
  // An unmatched link has no capability placement to disagree with: the
  // table never matched the cited text, which is its own finding.
  if (input.matched === 0) {
    return {
      release_conflict: 0,
      phase_conflict: 0,
      phase_conflict_merged: 0,
      feature_release_id: null,
      capability_release_id: null,
      feature_phase_label: null,
      capability_phase_label: null,
    }
  }

  const releaseConflict =
    input.capability_release_id !== null &&
    input.capability_release_id !== input.feature_release_id

  const phaseConflict = !sameLabel(input.feature_phase_label, input.capability_phase_label)
  const merged = phaseConflict && input.feature_phase_id === input.capability_phase_id

  return {
    release_conflict: releaseConflict ? 1 : 0,
    phase_conflict: phaseConflict ? 1 : 0,
    phase_conflict_merged: merged ? 1 : 0,
    // Both placements are recorded on a conflict and cleared off one, so a
    // settled link stops carrying the disagreement it used to (R-7.1).
    feature_release_id: releaseConflict ? input.feature_release_id : null,
    capability_release_id: releaseConflict ? input.capability_release_id : null,
    feature_phase_label: phaseConflict ? (input.feature_phase_label ?? '') : null,
    capability_phase_label: phaseConflict ? (input.capability_phase_label ?? '') : null,
  }
}
