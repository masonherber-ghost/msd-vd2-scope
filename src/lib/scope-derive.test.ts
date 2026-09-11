import { describe, expect, it } from 'vitest'
import {
  NO_ACTOR_ROW,
  buildScopeMap,
  cellKey,
  projectCells,
  releaseTokenSuffix,
  rowsFor,
  rowsForFeature,
} from '@/lib/scope-derive'
import { makeScopeGraph } from '@/test/scope-fixture'

const model = buildScopeMap(makeScopeGraph())

describe('buildScopeMap — grid shape', () => {
  it('produces one cell per phase × release', () => {
    expect(model.cells).toHaveLength(4)
    expect(model.totals.totalCells).toBe(4)
  })

  it('counts only cells that hold features as populated', () => {
    // Both features are in Access & Onboarding / 1.1.
    expect(model.totals.populatedCells).toBe(1)
  })

  it('keeps phases in canonical order', () => {
    expect(model.phases.map((p) => p.display_order)).toEqual([1, 2])
  })

  it('indexes cells for O(1) lookup', () => {
    const cell = model.cellIndex.get(cellKey('1.1', 'access-and-onboarding'))
    expect(cell?.features.map((f) => f.id)).toEqual(['F-001', 'F-002'])
  })

  it('leaves a genuinely empty cell empty', () => {
    const cell = model.cellIndex.get(cellKey('1.4', 'access-and-onboarding'))
    expect(cell?.features).toEqual([])
    expect(cell?.capabilityCount).toBe(0)
  })

  it('reports capabilities in a cell that has no features (R-8.5)', () => {
    const cell = model.cellIndex.get(cellKey('1.4', 'manage-vacancies'))
    expect(cell?.features).toEqual([])
    expect(cell?.capabilityCount).toBe(1)
  })
})

describe('buildScopeMap — feature cards', () => {
  const card = (id: string) =>
    model.cells.flatMap((c) => c.features).find((f) => f.id === id)!

  it('carries the MVP chips with their option, bare record first', () => {
    // The option-agnostic record reads as the feature itself; 1A/1B follow.
    expect(card('F-001').mvpFeatures).toEqual([
      { ref: 938, scopeOption: null },
      { ref: 938, scopeOption: '1A' },
    ])
    expect(card('F-002').mvpFeatures).toEqual([{ ref: 948, scopeOption: '1B' }])
  })

  it('summarises actors in a fixed order, omitting absent ones', () => {
    expect(card('F-001').actorCounts).toEqual([
      { actor: 'employer', count: 1 },
      { actor: 'staff', count: 1 },
    ])
  })

  it('counts the capabilities it cites', () => {
    expect(card('F-001').capabilityCount).toBe(2)
    expect(card('F-002').capabilityCount).toBe(1)
  })

  it('does NOT count a phase conflict the canonical merge resolves', () => {
    // F-001's second link is phase_conflict = 1 with phase_conflict_merged = 1.
    expect(card('F-001').conflicts.phase).toBe(0)
    expect(card('F-001').conflicts.release).toBe(0)
  })

  it('counts a real release and phase conflict', () => {
    expect(card('F-002').conflicts).toEqual({
      release: 1,
      phase: 1,
      unmatched: 1,
      unreviewed: 1,
    })
  })

  it('marks a feature the source documents were corrected for', () => {
    const corrected = buildScopeMap(
      makeScopeGraph({
        overrides: [
          {
            id: 'OV-001',
            featureId: 'F-002',
            releaseId: '1.1',
            rationale: 'r',
            decidedOn: '2026-09-09',
          },
        ],
      }),
    )
    const cards = corrected.cells.flatMap((c) => c.features)
    expect(cards.find((f) => f.id === 'F-002')?.overridden).toBe(true)
    expect(cards.find((f) => f.id === 'F-001')?.overridden).toBe(false)
  })
})

describe('buildScopeMap — totals', () => {
  it('counts features and capabilities per release', () => {
    expect(model.totals.featuresByRelease.get('1.1')).toBe(2)
    expect(model.totals.featuresByRelease.get('1.4')).toBeUndefined()
    expect(model.totals.capabilitiesByRelease.get('1.1')).toBe(2)
    expect(model.totals.capabilitiesByRelease.get('1.4')).toBe(1)
  })

  it('ignores a capability with no placement', () => {
    const withUnplaced = buildScopeMap(
      makeScopeGraph({
        capabilities: [
          {
            id: 99,
            mvp_feature_id: null,
            mvp_ref: 947,
            mvp_owner_ambiguous: 0,
            text: 'Review & publish vacancies',
            actor: 'staff',
            release_id: null,
            phase_id: null,
            source_phase_label: null,
            question: null,
            source: 'mapping',
          },
        ],
      }),
    )
    expect([...withUnplaced.totals.capabilitiesByRelease.values()]).toEqual([])
    expect(withUnplaced.cells.every((c) => c.capabilityCount === 0)).toBe(true)
  })
})

describe('releaseTokenSuffix', () => {
  it('makes a release id safe for a CSS class and token name', () => {
    expect(releaseTokenSuffix('1.1')).toBe('1-1')
    expect(releaseTokenSuffix('2')).toBe('2')
  })
})

describe('row modes (the design\'s transposed grid)', () => {
  const model = buildScopeMap(makeScopeGraph())

  it('gives a feature one row in release view', () => {
    const card = model.features.find((f) => f.id === 'F-001')!
    expect(rowsForFeature(card, 'release')).toEqual(['1.1'])
  })

  it('gives a feature one row per distinct actor in actor view', () => {
    // F-001 cites a staff and an employer capability, so it appears twice —
    // the design puts F-001 in both rows too.
    const card = model.features.find((f) => f.id === 'F-001')!
    expect(rowsForFeature(card, 'actor').sort()).toEqual(['employer', 'staff'])
  })

  it('puts a feature with no capabilities in the no-actor row', () => {
    const noCaps = buildScopeMap(
      makeScopeGraph({ featureCapabilityLinks: [] }),
    ).features.find((f) => f.id === 'F-001')!
    expect(rowsForFeature(noCaps, 'actor')).toEqual([NO_ACTOR_ROW])
  })

  it('lists actor rows in a fixed order, with no-actor last', () => {
    expect(rowsFor(model, 'actor').map((r) => r.key)).toEqual([
      'employer',
      'staff',
      'jobseeker',
      'system',
      NO_ACTOR_ROW,
    ])
  })

  it('lists release rows in release order', () => {
    expect(rowsFor(model, 'release').map((r) => r.key)).toEqual(['1.1', '1.4'])
  })
})

describe('projectCells across row modes', () => {
  const model = buildScopeMap(makeScopeGraph())

  it('keys cells by row and phase in release view', () => {
    const projected = projectCells(model, model.features, 'release')
    const cell = projected.cellIndex.get(cellKey('1.1', 'access-and-onboarding'))
    expect(cell?.features.map((f) => f.id)).toEqual(['F-001', 'F-002'])
  })

  it('places a multi-actor feature in each of its actor rows', () => {
    const projected = projectCells(model, model.features, 'actor')
    const staff = projected.cellIndex.get(cellKey('staff', 'access-and-onboarding'))
    const employer = projected.cellIndex.get(cellKey('employer', 'access-and-onboarding'))

    expect(staff?.features.map((f) => f.id)).toEqual(['F-001'])
    expect(employer?.features.map((f) => f.id)).toEqual(['F-001', 'F-002'])
  })

  it('never loses a feature when switching view', () => {
    const byRelease = projectCells(model, model.features, 'release')
    const byActor = projectCells(model, model.features, 'actor')

    const seen = (p: typeof byRelease) =>
      new Set(p.cells.flatMap((c) => c.features.map((f) => f.id)))

    expect(seen(byActor)).toEqual(seen(byRelease))
  })

  it('carries capability counts in both views', () => {
    const byRelease = projectCells(model, model.features, 'release')
    const byActor = projectCells(model, model.features, 'actor')

    expect(
      byRelease.cellIndex.get(cellKey('1.4', 'manage-vacancies'))?.capabilityCount,
    ).toBe(1)
    // The same capability, counted against its actor row instead.
    expect(
      byActor.cellIndex.get(cellKey('employer', 'manage-vacancies'))?.capabilityCount,
    ).toBe(1)
  })

  it('counts a duplicated feature once per row it appears in', () => {
    const projected = projectCells(model, model.features, 'actor')
    const total = projected.cells.reduce((n, c) => n + c.features.length, 0)
    // F-001 in two actor rows plus F-002 in one.
    expect(total).toBe(3)
  })
})
