import type {
  CapabilityRow,
  FeatureCapabilityLinkRow,
  MvpFeatureRow,
  PhaseRow,
  PwcFeatureRow,
  ReleaseRow,
  ScopeGraph,
} from '@/lib/api-client'

export type Actor = 'employer' | 'staff' | 'jobseeker' | 'system'

export const ACTOR_ORDER: readonly Actor[] = ['employer', 'staff', 'jobseeker', 'system']

export type FeatureCardModel = {
  id: string
  name: string
  releaseId: string
  phaseId: string
  /** MVP chips, in ref order, carrying the 1A/1B option where set. */
  mvpFeatures: { ref: number; scopeOption: '1A' | '1B' | null }[]
  /** Actor counts across the capabilities this feature cites. */
  actorCounts: { actor: Actor; count: number }[]
  capabilityCount: number
  /** Unresolved conflicts on this feature's capability links. */
  conflicts: { release: number; phase: number; unmatched: number; unreviewed: number }
  /** True when the source documents were corrected for this feature. */
  overridden: boolean
}

export type ScopeCell = {
  releaseId: string
  phaseId: string
  features: FeatureCardModel[]
  /** Capabilities the sequencing table places in this cell. */
  capabilityCount: number
}

export type ScopeMapModel = {
  releases: ReleaseRow[]
  phases: PhaseRow[]
  cells: ScopeCell[]
  /** Keyed `${phaseId}|${releaseId}` for O(1) lookup while rendering. */
  cellIndex: Map<string, ScopeCell>
  totals: {
    features: number
    populatedCells: number
    totalCells: number
    capabilitiesByRelease: Map<string, number>
    featuresByRelease: Map<string, number>
  }
}

export const cellKey = (phaseId: string, releaseId: string) => `${phaseId}|${releaseId}`

function buildFeatureCard(
  feature: PwcFeatureRow,
  links: FeatureCapabilityLinkRow[],
  capabilitiesById: Map<number, CapabilityRow>,
  mvpByFeature: Map<string, MvpFeatureRow[]>,
  overriddenIds: Set<string>,
): FeatureCardModel {
  const counts = new Map<Actor, number>()
  let release = 0
  let phase = 0
  let unmatched = 0
  let unreviewed = 0

  for (const link of links) {
    const capability = capabilitiesById.get(link.capability_id)
    if (capability) {
      counts.set(capability.actor, (counts.get(capability.actor) ?? 0) + 1)
    }
    if (link.release_conflict === 1) release += 1
    // A phase conflict the canonical merge already resolves is not a finding.
    if (link.phase_conflict === 1 && link.phase_conflict_merged === 0) phase += 1
    if (link.matched === 0) unmatched += 1
    if (
      (link.release_conflict === 1 || link.phase_conflict === 1) &&
      link.resolution_state === 'unreviewed'
    ) {
      unreviewed += 1
    }
  }

  return {
    id: feature.id,
    name: feature.name,
    releaseId: feature.release_id,
    phaseId: feature.phase_id,
    // Sorted by ref, then bare before 1A before 1B — the option-agnostic
    // record reads as the feature itself, with its variants after it.
    mvpFeatures: (mvpByFeature.get(feature.id) ?? [])
      .map((m) => ({ ref: m.ref, scopeOption: m.scope_option }))
      .sort(
        (a, b) => a.ref - b.ref || (a.scopeOption ?? '').localeCompare(b.scopeOption ?? ''),
      ),
    actorCounts: ACTOR_ORDER.filter((actor) => counts.has(actor)).map((actor) => ({
      actor,
      count: counts.get(actor) ?? 0,
    })),
    capabilityCount: links.length,
    conflicts: { release, phase, unmatched, unreviewed },
    overridden: overriddenIds.has(feature.id),
  }
}

/**
 * Builds the map model from the single graph payload. Pure — every view
 * derives from this rather than issuing its own query (R-10.7).
 */
export function buildScopeMap(graph: ScopeGraph): ScopeMapModel {
  const capabilitiesById = new Map(graph.capabilities.map((c) => [c.id, c]))
  const mvpById = new Map(graph.mvpFeatures.map((m) => [m.id, m]))

  const linksByFeature = new Map<string, FeatureCapabilityLinkRow[]>()
  for (const link of graph.featureCapabilityLinks) {
    const list = linksByFeature.get(link.pwc_feature_id) ?? []
    list.push(link)
    linksByFeature.set(link.pwc_feature_id, list)
  }

  const mvpByFeature = new Map<string, MvpFeatureRow[]>()
  for (const link of graph.featureMvpLinks) {
    const mvp = mvpById.get(link.mvp_feature_id)
    if (!mvp) continue
    const list = mvpByFeature.get(link.pwc_feature_id) ?? []
    list.push(mvp)
    mvpByFeature.set(link.pwc_feature_id, list)
  }

  const overriddenIds = new Set(graph.overrides.map((o) => o.featureId))

  const cards = graph.pwcFeatures.map((feature) =>
    buildFeatureCard(
      feature,
      linksByFeature.get(feature.id) ?? [],
      capabilitiesById,
      mvpByFeature,
      overriddenIds,
    ),
  )

  // Capability counts per cell come from the table's own placement, which is
  // why release 1.4 and 2 are not empty even with no features (R-8.5).
  const capabilityCellCounts = new Map<string, number>()
  const capabilitiesByRelease = new Map<string, number>()
  for (const capability of graph.capabilities) {
    if (!capability.release_id || !capability.phase_id) continue
    const key = cellKey(capability.phase_id, capability.release_id)
    capabilityCellCounts.set(key, (capabilityCellCounts.get(key) ?? 0) + 1)
    capabilitiesByRelease.set(
      capability.release_id,
      (capabilitiesByRelease.get(capability.release_id) ?? 0) + 1,
    )
  }

  const cells: ScopeCell[] = []
  const cellIndex = new Map<string, ScopeCell>()
  let populatedCells = 0

  for (const phase of graph.phases) {
    for (const release of graph.releases) {
      const key = cellKey(phase.id, release.id)
      const features = cards.filter(
        (c) => c.phaseId === phase.id && c.releaseId === release.id,
      )
      if (features.length > 0) populatedCells += 1
      const cell: ScopeCell = {
        releaseId: release.id,
        phaseId: phase.id,
        features,
        capabilityCount: capabilityCellCounts.get(key) ?? 0,
      }
      cells.push(cell)
      cellIndex.set(key, cell)
    }
  }

  const featuresByRelease = new Map<string, number>()
  for (const card of cards) {
    featuresByRelease.set(card.releaseId, (featuresByRelease.get(card.releaseId) ?? 0) + 1)
  }

  return {
    releases: graph.releases,
    phases: graph.phases,
    cells,
    cellIndex,
    totals: {
      features: cards.length,
      populatedCells,
      totalCells: graph.phases.length * graph.releases.length,
      capabilitiesByRelease,
      featuresByRelease,
    },
  }
}

/** Token suffix for a release id: `1.1` → `1-1`. */
export const releaseTokenSuffix = (releaseId: string) => releaseId.replace(/\./g, '-')
