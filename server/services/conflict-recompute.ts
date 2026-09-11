import {
  getAllConflictInputs,
  getConflictInputsForCapability,
  getConflictInputsForFeature,
  setLinkConflictFlags,
  type ConflictInputs,
} from '../repositories/feature-link-repository.js'

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

function changed(input: ConflictInputs, next: LinkConflictFlags): boolean {
  return (
    input.release_conflict !== next.release_conflict ||
    input.phase_conflict !== next.phase_conflict ||
    input.phase_conflict_merged !== next.phase_conflict_merged
  )
}

function apply(inputs: ConflictInputs[]): number {
  let updated = 0
  for (const input of inputs) {
    const next = deriveLinkConflict(input)
    // Always write: the recorded placements can move even when the flags do
    // not. The count reports flag changes, which is what a caller reports.
    setLinkConflictFlags({ id: input.link_id, ...next })
    if (changed(input, next)) updated += 1
  }
  return updated
}

/** Recomputes every live link to a capability. Returns how many flags moved. */
export function recomputeConflictsForCapability(capabilityId: number): number {
  return apply(getConflictInputsForCapability(capabilityId))
}

/** Recomputes every live link from a feature. Returns how many flags moved. */
export function recomputeConflictsForFeature(featureId: string): number {
  return apply(getConflictInputsForFeature(featureId))
}

/** Recomputes the whole graph — used to prove the rules match the import. */
export function recomputeAllConflicts(): number {
  return apply(getAllConflictInputs())
}
