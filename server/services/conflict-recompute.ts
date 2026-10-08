import {
  getAllConflictInputs,
  getConflictInputsForCapability,
  getConflictInputsForFeature,
  setLinkConflictFlags,
} from '../repositories/feature-link-repository.js'
import {
  deriveLinkConflict,
  type ConflictInputs,
  type LinkConflictFlags,
} from '../../src/lib/conflict-rules.js'

export { deriveLinkConflict, type LinkConflictFlags }

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
