import { describe, expect, it } from 'vitest'
import { deriveConflicts, deriveScopeGraph } from '@/lib/scope-graph'
import type {
  RawScope,
  StoredCapability,
  StoredFeatureCapabilityLink,
} from '@/lib/scope-records'

const T = '2026-09-11 00:00:00'

function capability(id: number, mvp_ref: number, text = `Cap ${id}`): StoredCapability {
  return {
    id,
    mvp_feature_id: null,
    mvp_ref,
    mvp_owner_ambiguous: 0,
    text,
    actor: 'staff',
    release_id: '1.1',
    phase_id: 'p',
    source_phase_label: null,
    question: null,
    source: 'sequencing',
    source_text: text,
    created_at: T,
    updated_at: T,
  }
}

function link(
  id: number,
  pwc_feature_id: string,
  capability_id: number,
  extra: Partial<StoredFeatureCapabilityLink> = {},
): StoredFeatureCapabilityLink {
  return {
    id,
    pwc_feature_id,
    capability_id,
    source_citations: 1,
    matched: 1,
    release_conflict: 0,
    phase_conflict: 0,
    feature_release_id: null,
    capability_release_id: null,
    feature_phase_label: null,
    capability_phase_label: null,
    phase_conflict_merged: 0,
    resolution_state: 'unreviewed',
    resolution_note: null,
    resolved_at: null,
    source: 'mapping',
    created_at: T,
    updated_at: T,
    removed_at: null,
    ...extra,
  }
}

function raw(overrides: Partial<RawScope> = {}): RawScope {
  return {
    releases: [],
    phases: [],
    pwcFeatures: [],
    mvpFeatures: [],
    capabilities: [],
    featureMvpLinks: [],
    featureCapabilityLinks: [],
    ...overrides,
  }
}

describe('deriveScopeGraph', () => {
  it('leaves tombstoned links out of the graph and the counts', () => {
    const graph = deriveScopeGraph(
      raw({
        featureCapabilityLinks: [
          link(1, 'F-001', 1),
          link(2, 'F-001', 2, { removed_at: T, release_conflict: 1 }),
        ],
        featureMvpLinks: [
          { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping', created_at: T, updated_at: T, removed_at: null },
          { pwc_feature_id: 'F-001', mvp_feature_id: 2, source: 'manual', created_at: T, updated_at: T, removed_at: T },
        ],
      }),
    )
    expect(graph.featureCapabilityLinks.map((l) => l.id)).toEqual([1])
    expect(graph.featureMvpLinks.map((l) => l.mvp_feature_id)).toEqual([1])
    expect(graph.counts.releaseConflicts).toBe(0)
    expect(graph.counts.featureCapabilityEdges).toBe(1)
  })

  it('hides the source wording re-import matches on, and nothing else', () => {
    const [row] = deriveScopeGraph(raw({ capabilities: [capability(1, 10)] })).capabilities
    expect(row).not.toHaveProperty('source_text')
    expect(row).toHaveProperty('created_at', T)
  })

  it('orders capabilities by ref then id, and MVP records by ref then option', () => {
    const graph = deriveScopeGraph(
      raw({
        capabilities: [capability(3, 20), capability(2, 10), capability(1, 20)],
        mvpFeatures: [
          { id: 1, ref: 5, scope_option: '1B', title: 'b', release_id: null, phase_id: null, question: null, details: '', source: 'mapping', created_at: T, updated_at: T },
          { id: 2, ref: 5, scope_option: null, title: 'none', release_id: null, phase_id: null, question: null, details: '', source: 'mapping', created_at: T, updated_at: T },
          { id: 3, ref: 5, scope_option: '1A', title: 'a', release_id: null, phase_id: null, question: null, details: '', source: 'mapping', created_at: T, updated_at: T },
        ],
      }),
    )
    expect(graph.capabilities.map((c) => c.id)).toEqual([2, 1, 3])
    // NULL sorts as '' — before any option.
    expect(graph.mvpFeatures.map((m) => m.scope_option)).toEqual([null, '1A', '1B'])
  })

  it('orders links by feature id in byte order, as SQLite does', () => {
    const graph = deriveScopeGraph(
      raw({ featureCapabilityLinks: [link(1, 'F-010', 1), link(2, 'F-002', 9), link(3, 'F-002', 3)] }),
    )
    expect(graph.featureCapabilityLinks.map((l) => l.id)).toEqual([3, 2, 1])
  })

  it('counts citations, conflicts, unresolved and unmatched', () => {
    const graph = deriveScopeGraph(
      raw({
        featureCapabilityLinks: [
          link(1, 'F-001', 1, { source_citations: 2, release_conflict: 1 }),
          link(2, 'F-001', 2, { phase_conflict: 1, resolution_state: 'table_wins' }),
          link(3, 'F-002', 3, { matched: 0 }),
        ],
      }),
    )
    expect(graph.counts).toMatchObject({
      featureCapabilityCitations: 4,
      releaseConflicts: 1,
      phaseConflicts: 1,
      unresolvedConflicts: 1,
      unmatchedLinks: 1,
    })
    expect(deriveConflicts(graph).map((l) => l.id)).toEqual([1, 2, 3])
  })
})
