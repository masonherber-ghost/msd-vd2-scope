import type { ScopeGraph } from '@/lib/api-client'
import { cellKey, type Actor } from '@/lib/scope-derive'
import {
  activeGroups,
  withoutGroup,
  type FilterGroup,
  type FilterState,
} from '@/lib/scope-filters'

/**
 * The capability view. Cards are capabilities rather than features, so the
 * map answers "what actually gets delivered in this release and stage, and
 * who asked for it".
 *
 * Unlike an MSD feature, a capability needs no placement rule: the
 * sequencing table gives it a release and a phase directly. The only ones
 * without are those the table never matched — one, at the time of writing —
 * and they are listed rather than dropped.
 */
export type CapabilityCardModel = {
  id: number
  text: string
  actor: Actor
  /** The MVP ref the capability sits under in the table. */
  ref: number
  /** True when the ref carries several records and the owner was a rule (D-3). */
  ownerAmbiguous: boolean
  releaseId: string | null
  phaseId: string | null
  /** A question someone raised about it. Not a source disagreement — a
   *  person flagging something that needs an answer — but shown like one. */
  question: string | null
  source: string
  /** The MSD feature that owns it, where the ref resolved to one. */
  mvpFeature: { id: number; ref: number; scopeOption: '1A' | '1B' | null; title: string } | null
  /** The PwC features citing it — often none, for a table-only capability. */
  pwcFeatures: { id: string; name: string; releaseId: string }[]
  /** Counted across this capability's links, in whichever feature they sit. */
  conflicts: { release: number; phase: number; unmatched: number; unreviewed: number }
}

/** Builds every capability card from the one graph payload (R-10.7). */
export function buildCapabilityCards(graph: ScopeGraph): CapabilityCardModel[] {
  const featureById = new Map(graph.pwcFeatures.map((f) => [f.id, f]))
  const mvpById = new Map(graph.mvpFeatures.map((m) => [m.id, m]))

  const citersByCapability = new Map<number, CapabilityCardModel['pwcFeatures']>()
  const conflictsByCapability = new Map<number, CapabilityCardModel['conflicts']>()

  for (const link of graph.featureCapabilityLinks) {
    const feature = featureById.get(link.pwc_feature_id)
    if (!feature) continue

    const citers = citersByCapability.get(link.capability_id) ?? []
    citers.push({ id: feature.id, name: feature.name, releaseId: feature.release_id })
    citersByCapability.set(link.capability_id, citers)

    const counts = conflictsByCapability.get(link.capability_id) ?? {
      release: 0,
      phase: 0,
      unmatched: 0,
      unreviewed: 0,
    }
    if (link.release_conflict === 1) counts.release += 1
    // A phase disagreement the canonical merge settles is not a finding.
    if (link.phase_conflict === 1 && link.phase_conflict_merged === 0) counts.phase += 1
    if (link.matched === 0) counts.unmatched += 1
    if (
      (link.release_conflict === 1 || link.phase_conflict === 1) &&
      link.resolution_state === 'unreviewed'
    ) {
      counts.unreviewed += 1
    }
    conflictsByCapability.set(link.capability_id, counts)
  }

  return graph.capabilities
    .map((capability) => {
      const mvp =
        capability.mvp_feature_id === null ? null : mvpById.get(capability.mvp_feature_id)
      return {
        id: capability.id,
        text: capability.text,
        actor: capability.actor,
        ref: capability.mvp_ref,
        ownerAmbiguous: capability.mvp_owner_ambiguous === 1,
        releaseId: capability.release_id,
        phaseId: capability.phase_id,
        question: capability.question,
        source: capability.source,
        mvpFeature: mvp
          ? { id: mvp.id, ref: mvp.ref, scopeOption: mvp.scope_option, title: mvp.title }
          : null,
        pwcFeatures: (citersByCapability.get(capability.id) ?? []).sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
        conflicts: conflictsByCapability.get(capability.id) ?? {
          release: 0,
          phase: 0,
          unmatched: 0,
          unreviewed: 0,
        },
      }
    })
    .sort((a, b) => a.ref - b.ref || a.text.localeCompare(b.text))
}

/**
 * Filters that carry a meaning for a capability.
 *
 * `release`, `phase` and `actor` are its own. `mvp` and `option` read the
 * MSD feature it sits under, `feature` the PwC features citing it, and
 * `conflict` its links. `corrected` is a property of a PwC feature override,
 * not of a capability, so it is ignored rather than emptying the map.
 */
export function applyCapabilityFilters(
  cards: CapabilityCardModel[],
  state: FilterState,
): CapabilityCardModel[] {
  return cards.filter((card) => {
    if (state.release.length > 0) {
      if (card.releaseId === null || !state.release.includes(card.releaseId)) return false
    }
    if (state.phase.length > 0) {
      if (card.phaseId === null || !state.phase.includes(card.phaseId)) return false
    }
    if (state.actor.length > 0 && !state.actor.includes(card.actor)) return false
    if (state.mvp.length > 0 && !state.mvp.includes(card.ref)) return false
    if (state.option.length > 0) {
      const option = card.mvpFeature?.scopeOption ?? 'none'
      if (!state.option.includes(option)) return false
    }
    if (
      state.feature.length > 0 &&
      !card.pwcFeatures.some((f) => state.feature.includes(f.id))
    ) {
      return false
    }
    if (state.source.length > 0 && !state.source.includes(card.source)) return false
    if (state.conflict.length > 0) {
      const matches = state.conflict.some((kind) => {
        if (kind === 'release') return card.conflicts.release > 0
        if (kind === 'phase') return card.conflicts.phase > 0
        if (kind === 'unmatched') return card.conflicts.unmatched > 0
        if (kind === 'unreviewed') return card.conflicts.unreviewed > 0
        if (kind === 'question') return card.question !== null
        if (kind === 'none') {
          return (
            card.conflicts.release === 0 &&
            card.conflicts.phase === 0 &&
            card.conflicts.unmatched === 0 &&
            card.question === null
          )
        }
        // `corrected` marks a feature the sources were overridden for, which
        // says nothing about a capability.
        return false
      })
      if (!matches) return false
    }
    return true
  })
}

export type CapabilityProjection = {
  /** Keyed `${releaseId}|${phaseId}`, matching the feature grid's cells. */
  cellIndex: Map<string, CapabilityCardModel[]>
  /** Cards the table never placed — listed rather than dropped. */
  unplaced: CapabilityCardModel[]
  totals: { cards: number; populatedCells: number }
}

/** Buckets the visible capability cards into release × phase cells. */
export function projectCapabilityCells(
  cards: CapabilityCardModel[],
): CapabilityProjection {
  const cellIndex = new Map<string, CapabilityCardModel[]>()
  const unplaced: CapabilityCardModel[] = []

  for (const card of cards) {
    if (card.releaseId === null || card.phaseId === null) {
      unplaced.push(card)
      continue
    }
    const key = cellKey(card.releaseId, card.phaseId)
    const list = cellIndex.get(key) ?? []
    list.push(card)
    cellIndex.set(key, list)
  }

  return {
    cellIndex,
    unplaced,
    totals: { cards: cards.length, populatedCells: cellIndex.size },
  }
}

/**
 * Which single filter groups emptied the capability view. The feature view's
 * `blameGroups` reasons over PwC features, so it would name a group that did
 * not empty this one (R-8.10).
 */
export function blameCapabilityGroups(
  cards: CapabilityCardModel[],
  state: FilterState,
): FilterGroup[] {
  if (applyCapabilityFilters(cards, state).length > 0) return []
  return activeGroups(state).filter(
    (group) => applyCapabilityFilters(cards, withoutGroup(state, group)).length > 0,
  )
}
