import type { CapabilityRow, MvpFeatureRow, ScopeGraph } from '@/lib/api-client'
import { ACTOR_ORDER, cellKey, type Actor } from '@/lib/scope-derive'
import {
  activeGroups,
  withoutGroup,
  type FilterGroup,
  type FilterState,
} from '@/lib/scope-filters'

/**
 * The MSD-feature view. Cards are MVP feature records rather than PwC
 * features, so the map answers "where does this MSD feature land, and which
 * PwC features carry it" instead of the other way round.
 *
 * An MSD feature has no placement of its own — neither source gives it a
 * release or a phase. It is placed by what it owns, in this order:
 *
 *   1. **Its capabilities**, using the sequencing table's placement. This is
 *      the table's own opinion and covers 46 of the 51 records.
 *   2. **Its PwC features**, when it owns no placed capability. The five
 *      option variants (938/1A, 946/1A, 951/1B) and the two capability-less
 *      refs (937, 953) reach the map this way.
 *   3. Nothing — the card is unplaced and reported rather than dropped.
 *
 * Placement is a set, not a value: a record whose capabilities straddle two
 * cells appears in both, the same way actor view puts one feature in several
 * rows. Silently picking one would hide the straddle, which is the kind of
 * thing this app exists to surface.
 */
export type MvpPlacement = 'capability' | 'feature' | 'unplaced'

export type MvpCapability = {
  id: number
  text: string
  actor: Actor
  releaseId: string | null
  phaseId: string | null
  /** True when the ref carries several records and the owner was a rule (D-3). */
  ownerAmbiguous: boolean
}

export type MvpPwcFeature = {
  id: string
  name: string
  releaseId: string
  phaseId: string
}

export type MvpCardModel = {
  /** `mvp_features.id` — the numeric primary key, unique across options. */
  id: number
  ref: number
  scopeOption: '1A' | '1B' | null
  title: string
  source: string
  /** Every release × phase cell this record appears in. */
  cells: { releaseId: string; phaseId: string }[]
  /** How the cells were derived, for the card to state its own footing. */
  placement: MvpPlacement
  pwcFeatures: MvpPwcFeature[]
  capabilities: MvpCapability[]
  actorCounts: { actor: Actor; count: number }[]
  actors: Set<Actor>
  /** Releases this record touches, for filtering. */
  releaseIds: Set<string>
}

/** `947`, or `951 · 1B` where the record is an option variant. */
export const mvpCardLabel = (card: Pick<MvpCardModel, 'ref' | 'scopeOption'>) =>
  card.scopeOption ? `${card.ref} · ${card.scopeOption}` : String(card.ref)

function distinctCells(
  pairs: { releaseId: string | null; phaseId: string | null }[],
): { releaseId: string; phaseId: string }[] {
  const seen = new Map<string, { releaseId: string; phaseId: string }>()
  for (const { releaseId, phaseId } of pairs) {
    if (!releaseId || !phaseId) continue
    seen.set(cellKey(releaseId, phaseId), { releaseId, phaseId })
  }
  return [...seen.values()]
}

function buildCard(
  mvp: MvpFeatureRow,
  capabilities: CapabilityRow[],
  pwcFeatures: MvpPwcFeature[],
): MvpCardModel {
  const counts = new Map<Actor, number>()
  for (const capability of capabilities) {
    counts.set(capability.actor, (counts.get(capability.actor) ?? 0) + 1)
  }

  // Capabilities first, PwC features only as a fallback — the table's own
  // placement outranks the placement of a feature that merely cites it.
  const fromCapabilities = distinctCells(
    capabilities.map((c) => ({ releaseId: c.release_id, phaseId: c.phase_id })),
  )
  const cells =
    fromCapabilities.length > 0
      ? fromCapabilities
      : distinctCells(
          pwcFeatures.map((f) => ({ releaseId: f.releaseId, phaseId: f.phaseId })),
        )

  const placement: MvpPlacement =
    fromCapabilities.length > 0 ? 'capability' : cells.length > 0 ? 'feature' : 'unplaced'

  return {
    id: mvp.id,
    ref: mvp.ref,
    scopeOption: mvp.scope_option,
    title: mvp.title,
    source: mvp.source,
    cells,
    placement,
    pwcFeatures,
    capabilities: capabilities
      .map((c) => ({
        id: c.id,
        text: c.text,
        actor: c.actor,
        releaseId: c.release_id,
        phaseId: c.phase_id,
        ownerAmbiguous: c.mvp_owner_ambiguous === 1,
      }))
      .sort((a, b) => a.text.localeCompare(b.text)),
    actorCounts: ACTOR_ORDER.filter((actor) => counts.has(actor)).map((actor) => ({
      actor,
      count: counts.get(actor) ?? 0,
    })),
    actors: new Set(counts.keys()),
    releaseIds: new Set(cells.map((c) => c.releaseId)),
  }
}

/** Builds every MSD-feature card from the one graph payload (R-10.7). */
export function buildMvpCards(graph: ScopeGraph): MvpCardModel[] {
  const capabilitiesByMvp = new Map<number, CapabilityRow[]>()
  for (const capability of graph.capabilities) {
    if (capability.mvp_feature_id === null) continue
    const list = capabilitiesByMvp.get(capability.mvp_feature_id) ?? []
    list.push(capability)
    capabilitiesByMvp.set(capability.mvp_feature_id, list)
  }

  const featureById = new Map(graph.pwcFeatures.map((f) => [f.id, f]))
  const featuresByMvp = new Map<number, MvpPwcFeature[]>()
  for (const link of graph.featureMvpLinks) {
    const feature = featureById.get(link.pwc_feature_id)
    if (!feature) continue
    const list = featuresByMvp.get(link.mvp_feature_id) ?? []
    list.push({
      id: feature.id,
      name: feature.name,
      releaseId: feature.release_id,
      phaseId: feature.phase_id,
    })
    featuresByMvp.set(link.mvp_feature_id, list)
  }

  return graph.mvpFeatures
    .map((mvp) =>
      buildCard(
        mvp,
        capabilitiesByMvp.get(mvp.id) ?? [],
        (featuresByMvp.get(mvp.id) ?? []).sort((a, b) => a.id.localeCompare(b.id)),
      ),
    )
    .sort(
      (a, b) =>
        a.ref - b.ref || (a.scopeOption ?? '').localeCompare(b.scopeOption ?? ''),
    )
}

/**
 * The filter groups that carry a meaning for an MSD feature.
 *
 * `release`, `actor` and `mvp` map directly. `phase` matches any cell the
 * record lands in. `option` reads the record's own 1A/1B. `feature` matches
 * the PwC features that cite it, which is how "show me what F-014 pulls in"
 * works from this view. `conflict` and `source` are properties of a PwC
 * feature's links, not of an MSD feature, so they are deliberately ignored
 * here rather than silently emptying the map.
 */
export const MVP_FILTER_GROUPS = [
  'release',
  'phase',
  'actor',
  'mvp',
  'option',
  'feature',
] as const

export function applyMvpFilters(
  cards: MvpCardModel[],
  state: FilterState,
): MvpCardModel[] {
  return cards.filter((card) => {
    if (state.release.length > 0 && !state.release.some((r) => card.releaseIds.has(r))) {
      return false
    }
    if (
      state.phase.length > 0 &&
      !state.phase.some((p) => card.cells.some((cell) => cell.phaseId === p))
    ) {
      return false
    }
    if (state.actor.length > 0 && !state.actor.some((a) => card.actors.has(a))) {
      return false
    }
    if (state.mvp.length > 0 && !state.mvp.includes(card.ref)) return false
    if (state.option.length > 0) {
      const option = card.scopeOption ?? 'none'
      if (!state.option.includes(option)) return false
    }
    if (
      state.feature.length > 0 &&
      !card.pwcFeatures.some((f) => state.feature.includes(f.id))
    ) {
      return false
    }
    return true
  })
}

export type MvpProjection = {
  /** Keyed `${releaseId}|${phaseId}`, matching the feature grid's cells. */
  cellIndex: Map<string, MvpCardModel[]>
  /** Cards no source places anywhere — listed rather than dropped. */
  unplaced: MvpCardModel[]
  totals: { cards: number; populatedCells: number }
}

/** Buckets the visible MSD-feature cards into release × phase cells. */
export function projectMvpCells(cards: MvpCardModel[]): MvpProjection {
  const cellIndex = new Map<string, MvpCardModel[]>()
  const unplaced: MvpCardModel[] = []

  for (const card of cards) {
    if (card.cells.length === 0) {
      unplaced.push(card)
      continue
    }
    for (const cell of card.cells) {
      const key = cellKey(cell.releaseId, cell.phaseId)
      const list = cellIndex.get(key) ?? []
      list.push(card)
      cellIndex.set(key, list)
    }
  }

  return {
    cellIndex,
    unplaced,
    totals: { cards: cards.length, populatedCells: cellIndex.size },
  }
}

/**
 * The MSD-view counterpart of `blameGroups`: which single filter groups are
 * responsible for an empty map. Dropping any one of them brings cards back.
 *
 * The feature view's version cannot stand in here — it reasons over PwC
 * features, so it would name a group that is not what emptied *this* view.
 */
export function blameMvpGroups(
  cards: MvpCardModel[],
  state: FilterState,
): FilterGroup[] {
  if (applyMvpFilters(cards, state).length > 0) return []
  return activeGroups(state).filter(
    (group) => applyMvpFilters(cards, withoutGroup(state, group)).length > 0,
  )
}
