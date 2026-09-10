import type { ScopeGraph } from '@/lib/api-client'
import type { ResolutionState } from '@/lib/validators'

export type ConflictKind = 'release' | 'phase' | 'unmatched'

export type ConflictRow = {
  /** The join-row id — what a resolution is written against. */
  id: number
  kind: ConflictKind
  featureId: string
  featureName: string
  capabilityId: number
  capabilityText: string
  capabilityRef: number
  actor: string
  /** Both recorded placements, so neither source is hidden (R-7.1). */
  featurePlacement: string
  tablePlacement: string
  resolutionState: ResolutionState
  resolutionNote: string | null
  resolvedAt: string | null
}

export type ConflictModel = {
  release: ConflictRow[]
  phase: ConflictRow[]
  unmatched: ConflictRow[]
  counts: {
    release: number
    phase: number
    unmatched: number
    total: number
    unreviewed: number
    /** Phase disagreements the canonical merge already settles — not findings. */
    phaseMerged: number
  }
  /** The release DECOMPOSITION_RELEASE_ID names, with its label (D-1). */
  decompositionRelease: { releaseId: string; label: string } | null
  /** Where the table actually schedules that release's capabilities (D-1). */
  decomposition: { releaseId: string; label: string; links: number }[]
}

/**
 * The release whose capabilities the table scatters across other releases
 * (PRD D-1). This was 1.9 until OV-003 declared 1.9 and 1.4 to be one
 * release; the disagreement moved with the features and did not go away.
 */
export const DECOMPOSITION_RELEASE_ID = '1.4'

/**
 * Groups the graph's conflicted links for the reconciliation queue.
 *
 * A phase disagreement the canonical merge resolves is counted but not
 * listed: both sides mean the same phase, so there is nothing to decide.
 */
export function buildConflictModel(graph: ScopeGraph): ConflictModel {
  const featureById = new Map(graph.pwcFeatures.map((f) => [f.id, f]))
  const capabilityById = new Map(graph.capabilities.map((c) => [c.id, c]))
  const releaseLabel = new Map(graph.releases.map((r) => [r.id, r.label]))
  const phaseName = new Map(graph.phases.map((p) => [p.id, p.name]))

  const release: ConflictRow[] = []
  const phase: ConflictRow[] = []
  const unmatched: ConflictRow[] = []
  let phaseMerged = 0

  const decomposition = new Map<string, number>()

  for (const link of graph.featureCapabilityLinks) {
    const feature = featureById.get(link.pwc_feature_id)
    const capability = capabilityById.get(link.capability_id)
    if (!feature || !capability) continue

    const base = {
      id: link.id,
      featureId: feature.id,
      featureName: feature.name,
      capabilityId: capability.id,
      capabilityText: capability.text,
      capabilityRef: capability.mvp_ref,
      actor: capability.actor,
      resolutionState: link.resolution_state as ResolutionState,
      resolutionNote: link.resolution_note,
      resolvedAt: link.resolved_at,
    }

    if (link.release_conflict === 1) {
      release.push({
        ...base,
        kind: 'release',
        featurePlacement: releaseLabel.get(feature.release_id) ?? feature.release_id,
        tablePlacement: capability.release_id
          ? (releaseLabel.get(capability.release_id) ?? capability.release_id)
          : 'not placed',
      })

      // The D-1 story: where the table actually schedules its capabilities.
      if (feature.release_id === DECOMPOSITION_RELEASE_ID && capability.release_id) {
        decomposition.set(
          capability.release_id,
          (decomposition.get(capability.release_id) ?? 0) + 1,
        )
      }
    }

    if (link.phase_conflict === 1) {
      if (link.phase_conflict_merged === 1) {
        phaseMerged += 1
      } else {
        phase.push({
          ...base,
          kind: 'phase',
          featurePlacement: phaseName.get(feature.phase_id) ?? feature.phase_id,
          tablePlacement: capability.phase_id
            ? (phaseName.get(capability.phase_id) ?? capability.phase_id)
            : 'not placed',
        })
      }
    }

    if (link.matched === 0) {
      unmatched.push({
        ...base,
        kind: 'unmatched',
        featurePlacement: releaseLabel.get(feature.release_id) ?? feature.release_id,
        tablePlacement: 'no exact match in the table',
      })
    }
  }

  const all = [...release, ...phase, ...unmatched]

  return {
    release,
    phase,
    unmatched,
    counts: {
      release: release.length,
      phase: phase.length,
      unmatched: unmatched.length,
      total: all.length,
      unreviewed: all.filter((row) => row.resolutionState === 'unreviewed').length,
      phaseMerged,
    },
    decompositionRelease: releaseLabel.has(DECOMPOSITION_RELEASE_ID)
      ? {
          releaseId: DECOMPOSITION_RELEASE_ID,
          label: releaseLabel.get(DECOMPOSITION_RELEASE_ID) ?? DECOMPOSITION_RELEASE_ID,
        }
      : null,
    decomposition: [...decomposition.entries()]
      .map(([releaseId, links]) => ({
        releaseId,
        label: releaseLabel.get(releaseId) ?? releaseId,
        links,
      }))
      .sort((a, b) => b.links - a.links),
  }
}

/** Feature ids carrying at least one unreviewed conflict, for map badges (R-7.4). */
export function unreviewedFeatureIds(model: ConflictModel): Set<string> {
  const ids = new Set<string>()
  for (const row of [...model.release, ...model.phase, ...model.unmatched]) {
    if (row.resolutionState === 'unreviewed') ids.add(row.featureId)
  }
  return ids
}
