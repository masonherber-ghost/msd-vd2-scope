import { describe, expect, it } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'
import {
  buildConflictModel,
  DECOMPOSITION_RELEASE_ID,
  unreviewedFeatureIds,
} from '@/lib/scope-conflicts'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph()
const model = buildConflictModel(graph)

describe('buildConflictModel — grouping', () => {
  it('groups a release conflict', () => {
    expect(model.release).toHaveLength(1)
    expect(model.release[0]).toMatchObject({
      featureId: 'F-002',
      capabilityText: 'Electronic T&Cs acceptance',
      kind: 'release',
    })
  })

  it('shows both placements, so neither source is hidden (R-7.1)', () => {
    expect(model.release[0]).toMatchObject({
      featurePlacement: 'Release 1.1',
      tablePlacement: 'Release 1.4',
    })
  })

  it('lists an unmatched link rather than merging it', () => {
    expect(model.unmatched).toHaveLength(1)
    expect(model.unmatched[0]).toMatchObject({
      featureId: 'F-002',
      tablePlacement: 'no exact match in the table',
    })
  })

  it('has no merge-resolved phase disagreement to count', () => {
    // Both documents carry the canonical phase name, so the merged case
    // cannot arise and F-001 raises no phase conflict at all.
    expect(model.counts.phaseMerged).toBe(0)
    expect(model.phase.every((row) => row.featureId !== 'F-001')).toBe(true)
  })

  it('lists a phase conflict that still needs a decision', () => {
    expect(model.phase).toHaveLength(1)
    expect(model.phase[0]).toMatchObject({
      featureId: 'F-002',
      featurePlacement: 'Access & Onboarding',
      tablePlacement: 'Manage Vacancies',
    })
  })

  it('carries the join-row id, which is what a resolution writes against', () => {
    expect(model.release[0].id).toBe(102)
  })
})

describe('buildConflictModel — counts', () => {
  it('totals each kind and the unreviewed set', () => {
    expect(model.counts).toMatchObject({
      release: 1,
      phase: 1,
      unmatched: 1,
      total: 3,
      unreviewed: 3,
    })
  })

  it('drops a resolved row out of the unreviewed count', () => {
    const resolved = buildConflictModel({
      ...graph,
      featureCapabilityLinks: graph.featureCapabilityLinks.map((link) =>
        link.id === 102
          ? { ...link, resolution_state: 'defect_raised' as const, resolved_at: 'now' }
          : link,
      ),
    })
    // One row is resolved, but it appears three times — release, phase and
    // unmatched all come from the same link.
    expect(resolved.counts.total).toBe(3)
    expect(resolved.counts.unreviewed).toBe(0)
  })
})

describe('buildConflictModel — release decomposition (D-1)', () => {
  it('is empty when no feature sits in the decomposed release', () => {
    expect(model.decomposition).toEqual([])
  })

  it('counts where the table actually schedules that release\u2019s capabilities', () => {
    // F-002 moves into the decomposed release and its conflicting capability
    // into 1.1, which is the shape the real data has after OV-003.
    const decomposedGraph: ScopeGraph = {
      ...graph,
      pwcFeatures: graph.pwcFeatures.map((feature) =>
        feature.id === 'F-002'
          ? { ...feature, release_id: DECOMPOSITION_RELEASE_ID }
          : feature,
      ),
      capabilities: graph.capabilities.map((capability) =>
        capability.id === 12 ? { ...capability, release_id: '1.1' } : capability,
      ),
    }
    const decomposed = buildConflictModel(decomposedGraph)
    expect(decomposed.decomposition).toEqual([
      { releaseId: '1.1', label: 'Release 1.1', links: 1 },
    ])
    expect(decomposed.decompositionRelease).toEqual({
      releaseId: DECOMPOSITION_RELEASE_ID,
      label: 'Release 1.4',
    })
  })
})

describe('unreviewedFeatureIds (R-7.4)', () => {
  it('names features with an unreviewed conflict', () => {
    expect([...unreviewedFeatureIds(model)]).toEqual(['F-002'])
  })

  it('drops a feature once every conflict on it is decided', () => {
    const resolved = buildConflictModel({
      ...graph,
      featureCapabilityLinks: graph.featureCapabilityLinks.map((link) =>
        link.id === 102 ? { ...link, resolution_state: 'table_wins' as const } : link,
      ),
    })
    expect([...unreviewedFeatureIds(resolved)]).toEqual([])
  })
})
