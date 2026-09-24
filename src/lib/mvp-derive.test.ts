import { describe, expect, it } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'
import {
  applyMvpFilters,
  buildMvpCards,
  mvpCardLabel,
  projectMvpCells,
} from '@/lib/mvp-derive'
import { EMPTY_FILTERS } from '@/lib/scope-filters'
import { cellKey } from '@/lib/scope-derive'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph()
const cards = buildMvpCards(graph)
const byId = new Map(cards.map((card) => [card.id, card]))

describe('buildMvpCards — identity', () => {
  it('makes one card per MVP record, not per ref', () => {
    // 938 carries a bare record and an Option 1A one; both are real records.
    expect(cards).toHaveLength(graph.mvpFeatures.length)
    expect(cards.filter((card) => card.ref === 938)).toHaveLength(2)
  })

  it('orders by ref, bare record before its option variants', () => {
    expect(cards.map((card) => [card.ref, card.scopeOption])).toEqual([
      [938, null],
      [938, '1A'],
      [948, '1B'],
    ])
  })

  it('labels an option variant apart from the bare record', () => {
    expect(mvpCardLabel({ ref: 938, scopeOption: null })).toBe('938')
    expect(mvpCardLabel({ ref: 938, scopeOption: '1A' })).toBe('938 · 1A')
  })
})

describe('buildMvpCards — placement', () => {
  it('places a record where the table schedules its capabilities', () => {
    const bare938 = byId.get(2)!
    expect(bare938.placement).toBe('capability')
    expect(bare938.cells).toEqual([
      { releaseId: '1.1', phaseId: 'access-and-onboarding' },
    ])
  })

  it('falls back to the citing PwC feature when it owns no capability', () => {
    const option1A = byId.get(1)!
    expect(option1A.capabilities).toEqual([])
    expect(option1A.placement).toBe('feature')
    expect(option1A.cells).toEqual([
      { releaseId: '1.1', phaseId: 'access-and-onboarding' },
    ])
  })

  it("prefers the table's placement over the citing feature's", () => {
    // 948 is cited by F-002 (1.1 / access-and-onboarding) but the table
    // schedules its capability in 1.4 / manage-vacancies. The table wins:
    // picking the feature's cell would hide the disagreement.
    const card = byId.get(3)!
    expect(card.pwcFeatures.map((f) => f.id)).toEqual(['F-002'])
    expect(card.cells).toEqual([{ releaseId: '1.4', phaseId: 'manage-vacancies' }])
    expect(card.placement).toBe('capability')
  })

  it('marks a record nothing places as unplaced rather than dropping it', () => {
    const orphan: ScopeGraph = {
      ...graph,
      mvpFeatures: [
        ...graph.mvpFeatures,
        { id: 99, ref: 999, scope_option: null, title: 'Nowhere', release_id: null, phase_id: null, question: null, source: 'mapping' },
      ],
    }
    const card = buildMvpCards(orphan).find((c) => c.id === 99)!
    expect(card.placement).toBe('unplaced')
    expect(card.cells).toEqual([])
  })

  it('places a record in every cell its capabilities straddle', () => {
    const straddling: ScopeGraph = {
      ...graph,
      capabilities: graph.capabilities.map((c) =>
        c.id === 11
          ? { ...c, release_id: '1.4', phase_id: 'manage-vacancies' }
          : c,
      ),
    }
    const card = buildMvpCards(straddling).find((c) => c.id === 2)!
    expect(card.cells).toHaveLength(2)
    expect(card.releaseIds).toEqual(new Set(['1.1', '1.4']))
  })

  it('ignores a capability the table never placed', () => {
    const unplacedCapability: ScopeGraph = {
      ...graph,
      capabilities: graph.capabilities.map((c) =>
        c.id === 12 ? { ...c, release_id: null, phase_id: null } : c,
      ),
    }
    const card = buildMvpCards(unplacedCapability).find((c) => c.id === 3)!
    // The capability still belongs to the record; it just cannot place it,
    // so the citing feature does instead.
    expect(card.capabilities).toHaveLength(1)
    expect(card.placement).toBe('feature')
    expect(card.cells).toEqual([
      { releaseId: '1.1', phaseId: 'access-and-onboarding' },
    ])
  })
})

describe('buildMvpCards — the detail the card carries', () => {
  it('names every PwC feature citing the record', () => {
    expect(byId.get(2)!.pwcFeatures.map((f) => f.id)).toEqual(['F-001'])
    expect(byId.get(1)!.pwcFeatures.map((f) => f.id)).toEqual(['F-001'])
  })

  it('lists the capabilities it owns, alphabetically', () => {
    expect(byId.get(2)!.capabilities.map((c) => c.text)).toEqual([
      'Invite employer to register',
      'Receive secure email invite',
    ])
  })

  it('counts actors across those capabilities in a fixed order', () => {
    expect(byId.get(2)!.actorCounts).toEqual([
      { actor: 'employer', count: 1 },
      { actor: 'staff', count: 1 },
    ])
  })

  it('carries the ambiguous-owner flag through (D-3)', () => {
    expect(byId.get(2)!.capabilities.every((c) => c.ownerAmbiguous)).toBe(true)
    expect(byId.get(3)!.capabilities.every((c) => c.ownerAmbiguous)).toBe(false)
  })
})

describe('applyMvpFilters', () => {
  it('returns everything when no filter is set', () => {
    expect(applyMvpFilters(cards, EMPTY_FILTERS)).toHaveLength(cards.length)
  })

  it('filters by the release the record actually lands in', () => {
    const inR14 = applyMvpFilters(cards, { ...EMPTY_FILTERS, release: ['1.4'] })
    expect(inR14.map((c) => c.id)).toEqual([3])
  })

  it('filters by phase across every cell the record touches', () => {
    const inVacancies = applyMvpFilters(cards, {
      ...EMPTY_FILTERS,
      phase: ['manage-vacancies'],
    })
    expect(inVacancies.map((c) => c.id)).toEqual([3])
  })

  it('filters by actor across the capabilities it owns', () => {
    const staff = applyMvpFilters(cards, { ...EMPTY_FILTERS, actor: ['staff'] })
    expect(staff.map((c) => c.id)).toEqual([2])
  })

  it('filters by ref, keeping every record under it', () => {
    const ref938 = applyMvpFilters(cards, { ...EMPTY_FILTERS, mvp: [938] })
    expect(ref938.map((c) => c.id).sort()).toEqual([1, 2])
  })

  it('treats the bare record as scope option "none"', () => {
    expect(
      applyMvpFilters(cards, { ...EMPTY_FILTERS, option: ['none'] }).map((c) => c.id),
    ).toEqual([2])
    expect(
      applyMvpFilters(cards, { ...EMPTY_FILTERS, option: ['1A'] }).map((c) => c.id),
    ).toEqual([1])
  })

  it('filters by the PwC feature that cites the record', () => {
    const viaF002 = applyMvpFilters(cards, { ...EMPTY_FILTERS, feature: ['F-002'] })
    expect(viaF002.map((c) => c.id)).toEqual([3])
  })

  it('ignores conflict and source, which belong to a PwC feature link', () => {
    // Applying them must not silently empty the map.
    const withIrrelevant = applyMvpFilters(cards, {
      ...EMPTY_FILTERS,
      conflict: ['release'],
      source: ['manual'],
    })
    expect(withIrrelevant).toHaveLength(cards.length)
  })

  it('composes AND across groups', () => {
    expect(
      applyMvpFilters(cards, { ...EMPTY_FILTERS, release: ['1.1'], actor: ['staff'] }),
    ).toHaveLength(1)
    expect(
      applyMvpFilters(cards, { ...EMPTY_FILTERS, release: ['1.4'], actor: ['staff'] }),
    ).toHaveLength(0)
  })
})

describe('projectMvpCells', () => {
  it('buckets cards into the same cell keys the feature grid uses', () => {
    const projection = projectMvpCells(cards)
    const onboarding = projection.cellIndex.get(
      cellKey('1.1', 'access-and-onboarding'),
    )
    expect(onboarding?.map((c) => c.id).sort()).toEqual([1, 2])
    expect(
      projection.cellIndex.get(cellKey('1.4', 'manage-vacancies'))?.map((c) => c.id),
    ).toEqual([3])
  })

  it('counts populated cells, not cards', () => {
    const projection = projectMvpCells(cards)
    expect(projection.totals.cards).toBe(3)
    expect(projection.totals.populatedCells).toBe(2)
  })

  it('collects unplaced cards instead of losing them', () => {
    const orphan = {
      ...graph,
      mvpFeatures: [
        ...graph.mvpFeatures,
        { id: 99, ref: 999, scope_option: null, title: 'Nowhere', release_id: null, phase_id: null, question: null, source: 'mapping' },
      ],
    } as ScopeGraph
    const projection = projectMvpCells(buildMvpCards(orphan))
    expect(projection.unplaced.map((c) => c.ref)).toEqual([999])
    expect(projection.totals.cards).toBe(4)
  })

  it('puts a straddling card in both its cells', () => {
    const straddling: ScopeGraph = {
      ...graph,
      capabilities: graph.capabilities.map((c) =>
        c.id === 11 ? { ...c, release_id: '1.4', phase_id: 'manage-vacancies' } : c,
      ),
    }
    const projection = projectMvpCells(buildMvpCards(straddling))
    expect(
      projection.cellIndex.get(cellKey('1.1', 'access-and-onboarding'))?.map((c) => c.id),
    ).toContain(2)
    expect(
      projection.cellIndex.get(cellKey('1.4', 'manage-vacancies'))?.map((c) => c.id),
    ).toContain(2)
  })
})

/**
 * A placement stated on the record itself. It outranks both derived ones,
 * and is the only thing that can place a record owning no capability.
 */
describe('buildMvpCards — a stated placement', () => {
  // Record 2 is the one the fixture's capabilities belong to, so it is the
  // one where a statement has a derived placement to outrank.
  const stated = (patch: { release_id?: string | null; phase_id?: string | null }) =>
    makeScopeGraph({
      mvpFeatures: makeScopeGraph().mvpFeatures.map((mvp) =>
        mvp.id === 2 ? { ...mvp, ...patch } : mvp,
      ),
    })

  it('outranks the capabilities the record owns', () => {
    // Capability 10 puts this record in 1.1 · access-and-onboarding.
    const graph = stated({ release_id: '1.4', phase_id: 'manage-vacancies' })
    const card = buildMvpCards(graph).find((c) => c.id === 2)
    expect(card?.cells).toEqual([{ releaseId: '1.4', phaseId: 'manage-vacancies' }])
    expect(card?.placement).toBe('stated')
  })

  it('places a record nothing else can place', () => {
    const graph = makeScopeGraph({
      mvpFeatures: [
        {
          id: 9,
          ref: 953,
          scope_option: null,
          title: 'Compliance view',
          release_id: '1.4',
          phase_id: 'manage-vacancies',
          question: null,
          source: 'sequencing',
        },
      ],
      capabilities: [],
      featureMvpLinks: [],
    })
    const card = buildMvpCards(graph).find((c) => c.id === 9)
    expect(card?.placement).toBe('stated')
    expect(card?.cells).toHaveLength(1)
  })

  it('needs both axes — half a statement places nothing', () => {
    // A cell is a release AND a stage; a release alone is not a position.
    const card = buildMvpCards(stated({ release_id: '1.4' })).find((c) => c.id === 2)
    expect(card?.placement).toBe('capability')
    expect(card?.stated).toEqual({ releaseId: '1.4', phaseId: null })
  })

  it('carries the half-statement so the editor can show it', () => {
    const card = buildMvpCards(stated({ phase_id: 'manage-vacancies' })).find(
      (c) => c.id === 2,
    )
    expect(card?.stated).toEqual({ releaseId: null, phaseId: 'manage-vacancies' })
  })

  it('leaves the derivation untouched when nothing is stated', () => {
    const card = buildMvpCards(makeScopeGraph()).find((c) => c.id === 2)
    expect(card?.placement).toBe('capability')
    expect(card?.stated).toEqual({ releaseId: null, phaseId: null })
  })

  it('files the record under the stated release for filtering', () => {
    const graph = stated({ release_id: '1.4', phase_id: 'manage-vacancies' })
    const card = buildMvpCards(graph).find((c) => c.id === 2)
    expect([...(card?.releaseIds ?? [])]).toEqual(['1.4'])
  })
})

/**
 * A question raised against an MSD feature record. Capabilities have carried
 * one since 006 and PwC features since 009; hanging a question about a
 * record off one of its capabilities attributed it to the wrong thing, and
 * left the five capability-less records with nowhere to put one.
 */
describe('buildMvpCards — a question on the record', () => {
  const withQuestion = (question: string | null) =>
    buildMvpCards(
      makeScopeGraph({
        mvpFeatures: makeScopeGraph().mvpFeatures.map((mvp) =>
          mvp.id === 2 ? { ...mvp, question } : mvp,
        ),
      }),
    ).find((card) => card.id === 2)

  it('carries the question onto the card', () => {
    expect(withQuestion('Is this still 1.1?')?.question).toBe('Is this still 1.1?')
  })

  it('is null when nobody has raised one', () => {
    expect(withQuestion(null)?.question).toBeNull()
  })

  it('reaches a record that owns no capability, which has no other home', () => {
    const orphan = buildMvpCards(
      makeScopeGraph({
        mvpFeatures: [
          {
            id: 9,
            ref: 953,
            scope_option: null,
            title: 'Compliance view',
            release_id: null,
            phase_id: null,
            question: 'Is this in scope at all?',
            source: 'sequencing',
          },
        ],
        capabilities: [],
        featureMvpLinks: [],
      }),
    ).find((card) => card.id === 9)

    expect(orphan?.capabilities).toEqual([])
    expect(orphan?.question).toBe('Is this in scope at all?')
  })
})
