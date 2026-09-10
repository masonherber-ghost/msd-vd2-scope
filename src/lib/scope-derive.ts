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
  /** Provenance: mapping | sequencing | both | manual (R-9.9). */
  source: string
  /** Distinct actors across this feature's capabilities, for filtering. */
  actors: Set<Actor>
  /** MVP refs this feature cites, for filtering. */
  mvpRefs: Set<number>
}

export type ScopeCell = {
  rowKey: string
  phaseId: string
  features: FeatureCardModel[]
  /** Capabilities the sequencing table places in this cell. */
  capabilityCount: number
}

export type ScopeMapModel = {
  releases: ReleaseRow[]
  phases: PhaseRow[]
  /** Every card, unfiltered — the filter rail derives its counts from these. */
  features: FeatureCardModel[]
  /** All MVP records, for the searchable MVP filter. */
  mvpFeatures: MvpFeatureRow[]
  cells: ScopeCell[]
  /** Keyed `${rowKey}|${phaseId}` for O(1) lookup while rendering. */
  cellIndex: Map<string, ScopeCell>
  /**
   * Capability counts for every cell key in BOTH row modes, so switching
   * view does not lose them — cellIndex only ever holds one mode's cells.
   */
  capabilityCellCounts: Map<string, number>
  totals: {
    features: number
    populatedCells: number
    totalCells: number
    capabilitiesByRelease: Map<string, number>
    featuresByRelease: Map<string, number>
  }
}

/**
 * The map is a grid of phases (across) by rows (down). A row is either an
 * actor or a release — the two views the design supports.
 */
export type RowMode = 'actor' | 'release'

/**
 * What the map is showing. The first two change how rows group; `mvp`
 * changes what a card *is* — MSD feature records rather than PwC features —
 * which is a different question of the same grid.
 */
export type ViewMode = 'release' | 'actor' | 'mvp'

/**
 * The row grouping a view uses. The MSD view groups by release: an MSD
 * feature is placed by its capabilities, and their release is the only
 * grouping either source actually states for it.
 */
export const rowModeFor = (view: ViewMode): RowMode =>
  view === 'actor' ? 'actor' : 'release'

export type ScopeRow = {
  key: string
  label: string
  blurb: string
  /** Token suffix for the row's accent colour. */
  tokenSuffix: string
}

/** Features with no capabilities have no actor; they still need a home. */
export const NO_ACTOR_ROW = 'no-actor'

export const ACTOR_ROWS: readonly ScopeRow[] = [
  {
    key: 'employer',
    label: 'Employers',
    blurb: 'Employer actions and capabilities',
    tokenSuffix: 'employer',
  },
  {
    key: 'staff',
    label: 'MSD staff',
    blurb: 'Staff review, verification and support',
    tokenSuffix: 'staff',
  },
  {
    key: 'jobseeker',
    label: 'Jobseekers',
    blurb: 'Jobseeker actions and open decisions',
    tokenSuffix: 'jobseeker',
  },
  {
    key: 'system',
    label: 'Systems',
    blurb: 'Core behaviours and integrations',
    tokenSuffix: 'system',
  },
  {
    key: NO_ACTOR_ROW,
    label: 'No actor recorded',
    blurb: 'Features whose capabilities the sources never mapped',
    tokenSuffix: 'none',
  },
]

export const cellKey = (rowKey: string, phaseId: string) => `${rowKey}|${phaseId}`

/**
 * Which rows a feature belongs in.
 *
 * In release view a feature has exactly one row. In actor view it has one
 * per distinct actor across its capabilities — the design does the same,
 * putting F-001 in both the employer and system rows. A feature with no
 * capabilities has no actor at all, so it falls to the no-actor row rather
 * than disappearing off the map.
 */
export function rowsForFeature(feature: FeatureCardModel, mode: RowMode): string[] {
  if (mode === 'release') return [feature.releaseId]
  if (feature.actors.size === 0) return [NO_ACTOR_ROW]
  return ACTOR_ROWS.filter((row) => feature.actors.has(row.key as Actor)).map((r) => r.key)
}

/** The rows to render, in order, for a given mode. */
export function rowsFor(model: ScopeMapModel, mode: RowMode): ScopeRow[] {
  if (mode === 'actor') return [...ACTOR_ROWS]
  return model.releases.map((release) => ({
    key: release.id,
    label: release.label,
    blurb: release.name || 'No description recorded',
    tokenSuffix: releaseTokenSuffix(release.id),
  }))
}

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

  const mvpRecords = mvpByFeature.get(feature.id) ?? []

  return {
    id: feature.id,
    name: feature.name,
    releaseId: feature.release_id,
    phaseId: feature.phase_id,
    source: feature.source,
    actors: new Set(counts.keys()),
    mvpRefs: new Set(mvpRecords.map((m) => m.ref)),
    // Sorted by ref, then bare before 1A before 1B — the option-agnostic
    // record reads as the feature itself, with its variants after it.
    mvpFeatures: mvpRecords
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
  // why release 1.4 and 2 are not empty even with no features (R-8.5). In
  // release view a cell is a release × phase, so the table's counts land
  // directly; in actor view they are counted per actor × phase instead.
  const capabilitiesByRelease = new Map<string, number>()
  const capabilityCellCounts = new Map<string, number>()
  for (const capability of graph.capabilities) {
    if (!capability.release_id || !capability.phase_id) continue
    capabilitiesByRelease.set(
      capability.release_id,
      (capabilitiesByRelease.get(capability.release_id) ?? 0) + 1,
    )
    for (const rowKey of [capability.release_id, capability.actor]) {
      const key = cellKey(rowKey, capability.phase_id)
      capabilityCellCounts.set(key, (capabilityCellCounts.get(key) ?? 0) + 1)
    }
  }

  const buildCells = (mode: RowMode, visible: FeatureCardModel[]) => {
    const cells: ScopeCell[] = []
    const index = new Map<string, ScopeCell>()
    let populated = 0

    const byCell = new Map<string, FeatureCardModel[]>()
    for (const card of visible) {
      for (const rowKey of rowsForFeature(card, mode)) {
        const key = cellKey(rowKey, card.phaseId)
        const list = byCell.get(key) ?? []
        list.push(card)
        byCell.set(key, list)
      }
    }

    for (const row of mode === 'actor'
      ? ACTOR_ROWS.map((r) => r.key)
      : graph.releases.map((r) => r.id)) {
      for (const phase of graph.phases) {
        const key = cellKey(row, phase.id)
        const features = byCell.get(key) ?? []
        if (features.length > 0) populated += 1
        const cell: ScopeCell = {
          rowKey: row,
          phaseId: phase.id,
          features,
          capabilityCount: capabilityCellCounts.get(key) ?? 0,
        }
        cells.push(cell)
        index.set(key, cell)
      }
    }

    return { cells, index, populated }
  }

  // The default view is by release, which keeps every cell addressable by
  // the release + phase pair the create flow needs.
  const built = buildCells('release', cards)
  const cells = built.cells
  const cellIndex = built.index
  const populatedCells = built.populated

  const featuresByRelease = new Map<string, number>()
  for (const card of cards) {
    featuresByRelease.set(card.releaseId, (featuresByRelease.get(card.releaseId) ?? 0) + 1)
  }

  return {
    releases: graph.releases,
    phases: graph.phases,
    features: cards,
    mvpFeatures: graph.mvpFeatures,
    capabilityCellCounts,
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

/**
 * Recomputes the grid for a subset of features. The full model keeps every
 * card so the filter rail can count against all of them; the grid renders
 * only what survived.
 *
 * Capability counts are deliberately not filtered — they are the sequencing
 * table's placement, a separate layer from the feature filters (R-8.5).
 */
export function projectCells(
  model: ScopeMapModel,
  visible: FeatureCardModel[],
  mode: RowMode = 'release',
): Pick<ScopeMapModel, 'cells' | 'cellIndex' | 'totals'> {
  const byCell = new Map<string, FeatureCardModel[]>()
  for (const card of visible) {
    for (const rowKey of rowsForFeature(card, mode)) {
      const key = cellKey(rowKey, card.phaseId)
      const list = byCell.get(key) ?? []
      list.push(card)
      byCell.set(key, list)
    }
  }

  const cells: ScopeCell[] = []
  const cellIndex = new Map<string, ScopeCell>()
  let populatedCells = 0

  const rowKeys =
    mode === 'actor' ? ACTOR_ROWS.map((r) => r.key) : model.releases.map((r) => r.id)

  for (const rowKey of rowKeys) {
    for (const phase of model.phases) {
      const key = cellKey(rowKey, phase.id)
      const features = byCell.get(key) ?? []
      if (features.length > 0) populatedCells += 1
      const cell: ScopeCell = {
        rowKey,
        phaseId: phase.id,
        features,
        capabilityCount: model.capabilityCellCounts.get(key) ?? 0,
      }
      cells.push(cell)
      cellIndex.set(key, cell)
    }
  }

  const featuresByRelease = new Map<string, number>()
  for (const card of visible) {
    featuresByRelease.set(card.releaseId, (featuresByRelease.get(card.releaseId) ?? 0) + 1)
  }

  return {
    cells,
    cellIndex,
    totals: {
      ...model.totals,
      features: visible.length,
      populatedCells,
      featuresByRelease,
    },
  }
}
