import { describe, expect, it } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'
import {
  applyCapabilityFilters,
  blameCapabilityGroups,
  buildCapabilityCards,
  projectCapabilityCells,
} from '@/lib/capability-derive'
import { cellKey } from '@/lib/scope-derive'
import { EMPTY_FILTERS } from '@/lib/scope-filters'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph()
const cards = buildCapabilityCards(graph)
const byId = new Map(cards.map((c) => [c.id, c]))

describe('buildCapabilityCards', () => {
  it('makes one card per capability', () => {
    expect(cards).toHaveLength(graph.capabilities.length)
  })

  it('orders by ref, then alphabetically', () => {
    expect(cards.map((c) => [c.ref, c.text])).toEqual([
      [938, 'Invite employer to register'],
      [938, 'Receive secure email invite'],
      [948, 'Electronic T&Cs acceptance'],
    ])
  })

  it('takes its placement straight from the table', () => {
    expect(byId.get(12)).toMatchObject({
      releaseId: '1.4',
      phaseId: 'manage-vacancies',
    })
  })

  it('names the MSD feature it sits under', () => {
    expect(byId.get(10)!.mvpFeature).toMatchObject({ ref: 938, scopeOption: null })
    expect(byId.get(12)!.mvpFeature).toMatchObject({ ref: 948, scopeOption: '1B' })
  })

  it('carries the ambiguous-owner flag (D-3)', () => {
    expect(byId.get(10)!.ownerAmbiguous).toBe(true)
    expect(byId.get(12)!.ownerAmbiguous).toBe(false)
  })

  it('names every PwC feature citing it', () => {
    expect(byId.get(10)!.pwcFeatures.map((f) => f.id)).toEqual(['F-001'])
    expect(byId.get(12)!.pwcFeatures.map((f) => f.id)).toEqual(['F-002'])
  })

  it('counts conflicts across its links', () => {
    // Link 101 carries none: the two documents word its phase the same way.
    expect(byId.get(11)!.conflicts).toEqual({
      release: 0,
      phase: 0,
      unmatched: 0,
      unreviewed: 0,
    })
    expect(byId.get(12)!.conflicts).toMatchObject({ release: 1, phase: 1, unmatched: 1 })
  })

  it('reports no citer for a capability nothing cites', () => {
    const orphan: ScopeGraph = {
      ...graph,
      featureCapabilityLinks: graph.featureCapabilityLinks.filter(
        (l) => l.capability_id !== 12,
      ),
    }
    const card = buildCapabilityCards(orphan).find((c) => c.id === 12)!
    expect(card.pwcFeatures).toEqual([])
    expect(card.conflicts).toEqual({ release: 0, phase: 0, unmatched: 0, unreviewed: 0 })
  })
})

describe('applyCapabilityFilters', () => {
  it('returns everything when nothing is set', () => {
    expect(applyCapabilityFilters(cards, EMPTY_FILTERS)).toHaveLength(cards.length)
  })

  it('filters by the capability’s own release and phase', () => {
    expect(
      applyCapabilityFilters(cards, { ...EMPTY_FILTERS, release: ['1.4'] }).map((c) => c.id),
    ).toEqual([12])
    expect(
      applyCapabilityFilters(cards, {
        ...EMPTY_FILTERS,
        phase: ['manage-vacancies'],
      }).map((c) => c.id),
    ).toEqual([12])
  })

  it('filters by its own actor', () => {
    expect(
      applyCapabilityFilters(cards, { ...EMPTY_FILTERS, actor: ['staff'] }).map((c) => c.id),
    ).toEqual([10])
  })

  it('filters by ref and by the option of the MSD feature above it', () => {
    expect(
      applyCapabilityFilters(cards, { ...EMPTY_FILTERS, mvp: [948] }).map((c) => c.id),
    ).toEqual([12])
    expect(
      applyCapabilityFilters(cards, { ...EMPTY_FILTERS, option: ['1B'] }).map((c) => c.id),
    ).toEqual([12])
  })

  it('filters by the PwC feature citing it', () => {
    expect(
      applyCapabilityFilters(cards, { ...EMPTY_FILTERS, feature: ['F-001'] }).map(
        (c) => c.id,
      ),
    ).toEqual([10, 11])
  })

  it('filters by conflict state', () => {
    expect(
      applyCapabilityFilters(cards, { ...EMPTY_FILTERS, conflict: ['release'] }).map(
        (c) => c.id,
      ),
    ).toEqual([12])
    expect(
      applyCapabilityFilters(cards, { ...EMPTY_FILTERS, conflict: ['none'] }).map(
        (c) => c.id,
      ),
    ).toEqual([10, 11])
  })

  it('ignores "corrected", which belongs to a feature override', () => {
    // It must narrow to nothing rather than silently matching everything.
    expect(
      applyCapabilityFilters(cards, { ...EMPTY_FILTERS, conflict: ['corrected'] }),
    ).toEqual([])
  })

  it('composes AND across groups', () => {
    expect(
      applyCapabilityFilters(cards, {
        ...EMPTY_FILTERS,
        release: ['1.1'],
        actor: ['staff'],
      }),
    ).toHaveLength(1)
    expect(
      applyCapabilityFilters(cards, {
        ...EMPTY_FILTERS,
        release: ['1.4'],
        actor: ['staff'],
      }),
    ).toHaveLength(0)
  })
})

describe('projectCapabilityCells', () => {
  it('buckets into the same cell keys the feature grid uses', () => {
    const projection = projectCapabilityCells(cards)
    expect(
      projection.cellIndex.get(cellKey('1.1', 'access-and-onboarding'))?.map((c) => c.id),
    ).toEqual([10, 11])
    expect(
      projection.cellIndex.get(cellKey('1.4', 'manage-vacancies'))?.map((c) => c.id),
    ).toEqual([12])
    expect(projection.totals).toEqual({ cards: 3, populatedCells: 2 })
  })

  it('collects an unplaced capability instead of losing it', () => {
    const unplaced: ScopeGraph = {
      ...graph,
      capabilities: graph.capabilities.map((c) =>
        c.id === 12 ? { ...c, release_id: null, phase_id: null } : c,
      ),
    }
    const projection = projectCapabilityCells(buildCapabilityCards(unplaced))
    expect(projection.unplaced.map((c) => c.id)).toEqual([12])
    expect(projection.totals.cards).toBe(3)
    expect(projection.totals.populatedCells).toBe(1)
  })
})

describe('blameCapabilityGroups', () => {
  it('is empty while anything survives', () => {
    expect(blameCapabilityGroups(cards, EMPTY_FILTERS)).toEqual([])
  })

  it('names the group that emptied this view', () => {
    expect(
      blameCapabilityGroups(cards, { ...EMPTY_FILTERS, actor: ['jobseeker'] }),
    ).toEqual(['actor'])
  })
})
