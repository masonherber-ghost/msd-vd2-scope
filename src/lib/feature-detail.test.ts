import { describe, expect, it } from 'vitest'
import { buildFeatureDetail } from '@/lib/feature-detail'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph()

describe('buildFeatureDetail — identity and placement', () => {
  it('returns null for a feature that does not exist', () => {
    expect(buildFeatureDetail(graph, 'F-999')).toBeNull()
  })

  it('resolves the release and phase labels and the epic ref', () => {
    const detail = buildFeatureDetail(graph, 'F-001')!
    expect(detail).toMatchObject({
      id: 'F-001',
      name: 'Invite employer',
      releaseLabel: 'Release 1.1',
      phaseName: 'Access & Onboarding',
      epicRef: '179',
    })
  })

  it('carries the canonical phase name as its label', () => {
    // The parsers store the canonical name rather than each document's own
    // heading, so the label and the phase can no longer contradict.
    const detail = buildFeatureDetail(graph, 'F-001')!
    expect(detail.sourcePhaseLabel).toBe('Access & Onboarding')
    expect(detail.phaseName).toBe('Access & Onboarding')
  })
})

describe('buildFeatureDetail — MVP features', () => {
  it('lists records with their option, bare first', () => {
    const detail = buildFeatureDetail(graph, 'F-001')!
    expect(detail.mvpFeatures.map((m) => [m.ref, m.scopeOption])).toEqual([
      [938, null],
      [938, '1A'],
    ])
  })
})

describe('buildFeatureDetail — capabilities grouped by actor', () => {
  it('groups by actor in a fixed order', () => {
    const detail = buildFeatureDetail(graph, 'F-001')!
    expect(detail.actorGroups.map((g) => g.actor)).toEqual(['employer', 'staff'])
  })

  it('carries each capability\'s own release and phase', () => {
    const detail = buildFeatureDetail(graph, 'F-002')!
    const [capability] = detail.actorGroups[0].capabilities
    expect(capability).toMatchObject({
      text: 'Electronic T&Cs acceptance',
      releaseLabel: 'Release 1.4',
      phaseName: 'Manage Vacancies',
    })
  })

  it('flags where a capability sits outside its feature\'s cell (R-8.15)', () => {
    const detail = buildFeatureDetail(graph, 'F-002')!
    const [capability] = detail.actorGroups[0].capabilities
    expect(capability.releaseDiffers).toBe(true)
    expect(capability.phaseDiffers).toBe(true)
    // Both placements survive; neither source is discarded.
    expect(capability.featureReleaseId).toBe('1.1')
    expect(capability.capabilityReleaseId).toBe('1.4')
  })

  it('raises no phase disagreement where the documents agree on the phase', () => {
    const detail = buildFeatureDetail(graph, 'F-001')!
    const employer = detail.actorGroups.find((g) => g.actor === 'employer')!
    const [capability] = employer.capabilities
    // Both carry the canonical phase name, so there is nothing to disagree
    // about and nothing to mark as merged.
    expect(capability.phaseConflict).toBe(false)
    expect(capability.phaseConflictMerged).toBe(false)
    expect(detail.conflicts.phase).toBe(0)
  })

  it('marks an unmatched capability', () => {
    const detail = buildFeatureDetail(graph, 'F-002')!
    expect(detail.actorGroups[0].capabilities[0].matched).toBe(false)
    expect(detail.conflicts.unmatched).toBe(1)
  })
})

describe('buildFeatureDetail — no capabilities (R-8.18)', () => {
  it('exposes the source\'s own qualifier instead of an empty section', () => {
    const withNote = makeScopeGraph({
      pwcFeatures: [
        {
          id: 'F-008',
          name: 'Account access recovery',
          foundational_build: 'Recovery without staff.',
          release_id: '1.1',
          phase_id: 'access-and-onboarding',
          source_phase_label: 'Access & onboarding',
          capability_note: 'No direct individual capabilities mapped in Release 1.1–1.3 table',
          display_order: 1,
          source: 'mapping',
        },
      ],
      featureCapabilityLinks: [],
      featureMvpLinks: [],
    })
    const detail = buildFeatureDetail(withNote, 'F-008')!
    expect(detail.capabilityCount).toBe(0)
    expect(detail.actorGroups).toEqual([])
    expect(detail.capabilityNote).toBe(
      'No direct individual capabilities mapped in Release 1.1–1.3 table',
    )
  })
})

describe('buildFeatureDetail — connected features (R-8.17)', () => {
  it('finds features sharing an MVP ref, and not the feature itself', () => {
    const shared = makeScopeGraph({
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
      ],
    })
    // Both link to ref 938 (records 1 and 2), so they are connected.
    const detail = buildFeatureDetail(shared, 'F-001')!
    expect(detail.connected.map((c) => c.id)).toEqual(['F-002'])
    expect(detail.connected[0].sharedRefs).toEqual([938])
  })

  it('flags a connection that crosses a release boundary', () => {
    const crossing = makeScopeGraph({
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
          id: 'F-003',
          name: 'B',
          foundational_build: '',
          release_id: '1.4',
          phase_id: 'access-and-onboarding',
          source_phase_label: null,
          capability_note: null,
          display_order: 2,
          source: 'mapping',
        },
      ],
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-003', mvp_feature_id: 1, source: 'mapping' },
      ],
      featureCapabilityLinks: [],
    })
    const detail = buildFeatureDetail(crossing, 'F-001')!
    expect(detail.connected).toHaveLength(1)
    expect(detail.connected[0]).toMatchObject({ id: 'F-003', crossesRelease: true })
  })

  it('sorts cross-release connections first', () => {
    const mixed = makeScopeGraph({
      pwcFeatures: [
        ...graph.pwcFeatures,
        {
          id: 'F-003',
          name: 'Elsewhere',
          foundational_build: '',
          release_id: '1.4',
          phase_id: 'access-and-onboarding',
          source_phase_label: null,
          capability_note: null,
          display_order: 3,
          source: 'mapping',
        },
      ],
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
        { pwc_feature_id: 'F-003', mvp_feature_id: 2, source: 'mapping' },
      ],
    })
    const detail = buildFeatureDetail(mixed, 'F-001')!
    expect(detail.connected.map((c) => [c.id, c.crossesRelease])).toEqual([
      ['F-003', true],
      ['F-002', false],
    ])
  })
})

describe('buildFeatureDetail — assumptions', () => {
  it('returns them in source order', () => {
    const withAssumptions = makeScopeGraph({
      assumptions: [
        { id: 3, pwc_feature_id: 'F-001', position: 3, text: 'third', source: 'mapping' },
        { id: 1, pwc_feature_id: 'F-001', position: 1, text: 'first', source: 'mapping' },
        { id: 2, pwc_feature_id: 'F-001', position: 2, text: 'second', source: 'mapping' },
        { id: 4, pwc_feature_id: 'F-002', position: 1, text: 'other', source: 'mapping' },
      ],
    })
    const detail = buildFeatureDetail(withAssumptions, 'F-001')!
    expect(detail.assumptions.map((a) => a.text)).toEqual(['first', 'second', 'third'])
  })
})

describe('buildFeatureDetail — corrected source', () => {
  it('surfaces the override rationale', () => {
    const corrected = makeScopeGraph({
      overrides: [
        {
          id: 'OV-001',
          featureId: 'F-001',
          releaseId: '1.4',
          rationale: 'Programme decision recorded here.',
          decidedOn: '2026-09-09',
        },
      ],
    })
    const detail = buildFeatureDetail(corrected, 'F-001')!
    expect(detail.overridden).toBe(true)
    expect(detail.overrideRationale).toBe('Programme decision recorded here.')
  })
})
