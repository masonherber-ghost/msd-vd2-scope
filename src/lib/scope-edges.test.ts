import { describe, expect, it } from 'vitest'
import { buildScopeMap } from '@/lib/scope-derive'
import {
  buildEdges,
  connectionDensity,
  densityBand,
  edgesFor,
} from '@/lib/scope-edges'
import { makeScopeGraph } from '@/test/scope-fixture'

/** Two features sharing ref 938, plus a third sharing nothing. */
function sharedGraph() {
  return makeScopeGraph({
    featureMvpLinks: [
      { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
      { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
    ],
  })
}

describe('buildEdges', () => {
  it('finds no edge when nothing is shared', () => {
    // The default fixture links F-001 to 938 and F-002 to 948.
    const model = buildScopeMap(makeScopeGraph())
    expect(buildEdges(model.features)).toEqual([])
  })

  it('links two features sharing an MVP ref', () => {
    const model = buildScopeMap(sharedGraph())
    const edges = buildEdges(model.features)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      fromId: 'F-001',
      toId: 'F-002',
      sharedRefs: [938],
    })
  })

  it('produces one undirected edge per pair, not two', () => {
    const model = buildScopeMap(sharedGraph())
    const edges = buildEdges(model.features)
    expect(edges.map((e) => e.id)).toEqual(['F-001|F-002'])
  })

  it('orders the pair by id so the key is stable', () => {
    const model = buildScopeMap(sharedGraph())
    const [edge] = buildEdges(model.features)
    expect(edge.fromId < edge.toId).toBe(true)
  })

  it('collects every shared ref onto one edge', () => {
    const graph = makeScopeGraph({
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-001', mvp_feature_id: 3, source: 'mapping' },
        { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
        { pwc_feature_id: 'F-002', mvp_feature_id: 3, source: 'mapping' },
      ],
    })
    const [edge] = buildEdges(buildScopeMap(graph).features)
    // 938 via records 1 and 2, 948 via record 3 — sorted.
    expect(edge.sharedRefs).toEqual([938, 948])
  })

  it('never links a feature to itself', () => {
    const graph = makeScopeGraph({
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-001', mvp_feature_id: 2, source: 'mapping' },
      ],
    })
    expect(buildEdges(buildScopeMap(graph).features)).toEqual([])
  })

  it('flags a cross-release edge (R-8.4)', () => {
    const graph = makeScopeGraph({
      pwcFeatures: [
        {
          id: 'F-001',
          name: 'A',
          foundational_build: '',
          release_id: '1.1',
          phase_id: 'access-and-onboarding',
          source_phase_label: null,
          capability_note: null,
          display_order: 1,
          source: 'mapping',
        },
        {
          id: 'F-002',
          name: 'B',
          foundational_build: '',
          release_id: '1.4',
          phase_id: 'manage-vacancies',
          source_phase_label: null,
          capability_note: null,
          display_order: 2,
          source: 'mapping',
        },
      ],
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
      ],
    })
    const [edge] = buildEdges(buildScopeMap(graph).features)
    expect(edge).toMatchObject({ crossesRelease: true, crossesPhase: true })
  })

  it('marks a same-release edge as not crossing', () => {
    const [edge] = buildEdges(buildScopeMap(sharedGraph()).features)
    expect(edge).toMatchObject({ crossesRelease: false, crossesPhase: false })
  })

  it('only links features it was given, so filtering removes edges', () => {
    const model = buildScopeMap(sharedGraph())
    const onlyOne = model.features.filter((f) => f.id === 'F-001')
    expect(buildEdges(onlyOne)).toEqual([])
  })
})

describe('edgesFor', () => {
  it('returns edges touching the feature from either end', () => {
    const edges = buildEdges(buildScopeMap(sharedGraph()).features)
    expect(edgesFor(edges, 'F-001')).toHaveLength(1)
    expect(edgesFor(edges, 'F-002')).toHaveLength(1)
    expect(edgesFor(edges, 'F-999')).toEqual([])
  })
})

describe('connectionDensity (R-8.3)', () => {
  it('counts each feature\'s edges', () => {
    const edges = buildEdges(buildScopeMap(sharedGraph()).features)
    const density = connectionDensity(edges)
    expect(density.get('F-001')).toBe(1)
    expect(density.get('F-002')).toBe(1)
  })

  it('omits a feature with no edges', () => {
    expect(connectionDensity([]).size).toBe(0)
  })
})

describe('densityBand', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [5, 2],
    [6, 3],
    [20, 3],
  ])('bands %i as %i', (count, band) => {
    expect(densityBand(count)).toBe(band)
  })
})
