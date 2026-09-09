import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMappingDocument } from './mapping-parser.js'
import { MAPPING_PATH } from './scope-source.js'
import {
  SCOPE_OVERRIDES,
  SCOPE_SPLITS,
  applyScopeOverrides,
  applyScopeSplits,
  type ScopeOverride,
  type ScopeSplit,
  type SplitPart,
} from './scope-overrides.js'

const parsed = parseMappingDocument(fs.readFileSync(MAPPING_PATH, 'utf8'))
const find = (result: typeof parsed, id: string) => result.features.find((f) => f.id === id)!

describe('applyScopeOverrides', () => {
  it('is a no-op when there are no overrides', () => {
    const { mapping, applied } = applyScopeOverrides(parsed, [])
    expect(applied).toEqual([])
    expect(mapping).toBe(parsed)
  })

  it('changes the release and phase of the targeted feature only', () => {
    const override: ScopeOverride = {
      id: 'OV-TEST',
      featureId: 'F-085',
      releaseId: '1.1',
      phaseLabel: 'Manage Vacancies',
      rationale: 'test',
      decidedOn: '2026-09-09',
    }
    const { mapping } = applyScopeOverrides(parsed, [override])

    expect(find(mapping, 'F-085')).toMatchObject({
      releaseId: '1.1',
      phaseId: 'manage-vacancies',
      sourcePhaseLabel: 'Manage Vacancies',
    })
    // Everything else is untouched.
    expect(find(mapping, 'F-086')).toEqual(find(parsed, 'F-086'))
    expect(mapping.features).toHaveLength(parsed.features.length)
  })

  it('does not mutate the parsed input', () => {
    const before = { ...find(parsed, 'F-085') }
    applyScopeOverrides(parsed, [
      {
        id: 'OV-TEST',
        featureId: 'F-085',
        releaseId: '1.1',
        phaseLabel: 'Manage Vacancies',
        rationale: 'test',
        decidedOn: '2026-09-09',
      },
    ])
    expect(find(parsed, 'F-085')).toEqual(before)
  })

  it('records the original placement so the correction stays auditable', () => {
    const { applied } = applyScopeOverrides(parsed, [
      {
        id: 'OV-TEST',
        featureId: 'F-085',
        releaseId: '1.1',
        phaseLabel: 'Manage Vacancies',
        rationale: 'test',
        decidedOn: '2026-09-09',
      },
    ])
    expect(applied[0].from).toEqual({
      releaseId: '1.3',
      phaseId: 'outcomes-and-support',
      sourcePhaseLabel: 'Outcomes & Support',
    })
  })

  it('allows a release-only override', () => {
    const { mapping } = applyScopeOverrides(parsed, [
      { id: 'OV-R', featureId: 'F-085', releaseId: '1.2', rationale: 'r', decidedOn: 'd' },
    ])
    expect(find(mapping, 'F-085')).toMatchObject({
      releaseId: '1.2',
      // phase is left exactly as the document had it
      phaseId: 'outcomes-and-support',
      sourcePhaseLabel: 'Outcomes & Support',
    })
  })

  it('rejects an override targeting a feature that does not exist', () => {
    expect(() =>
      applyScopeOverrides(parsed, [
        { id: 'OV-X', featureId: 'F-999', releaseId: '1.1', rationale: 'r', decidedOn: 'd' },
      ]),
    ).toThrow(/F-999, which is not in the mapping document/)
  })

  it('rejects an override naming a phase that is not canonical', () => {
    expect(() =>
      applyScopeOverrides(parsed, [
        {
          id: 'OV-X',
          featureId: 'F-085',
          phaseLabel: 'Invented Phase',
          rationale: 'r',
          decidedOn: 'd',
        },
      ]),
    ).toThrow(/Unrecognised phase label "Invented Phase"/)
  })
})

describe('the declared overrides', () => {
  it('all apply cleanly against the real document', () => {
    expect(() => applyScopeOverrides(parsed, SCOPE_OVERRIDES)).not.toThrow()
  })

  it('each carry a rationale and a decision date', () => {
    for (const override of SCOPE_OVERRIDES) {
      expect(override.rationale.length).toBeGreaterThan(20)
      expect(override.decidedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(override.id).toMatch(/^OV-\d{3}$/)
    }
  })

  it('have unique ids and target each feature at most once', () => {
    const ids = SCOPE_OVERRIDES.map((o) => o.id)
    const features = SCOPE_OVERRIDES.map((o) => o.featureId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(features).size).toBe(features.length)
  })
})

describe('applyScopeSplits', () => {
  const part = (over: Partial<SplitPart> = {}): SplitPart => ({
    featureId: 'F-085',
    name: 'A',
    releaseId: '1.2',
    phaseLabel: 'Manage Vacancies',
    mvpRefs: [972],
    assumptionPositions: [1],
    ...over,
  })
  const other = (over: Partial<SplitPart> = {}): SplitPart => ({
    featureId: 'F-093',
    name: 'B',
    releaseId: '1.3',
    phaseLabel: 'Employer Recruitment',
    mvpRefs: [990],
    assumptionPositions: [2, 3],
    ...over,
  })
  const split = (into: SplitPart[]): ScopeSplit => ({
    id: 'OV-TEST',
    featureId: 'F-085',
    into,
    rationale: 'test rationale that is long enough',
    decidedOn: '2026-09-09',
  })

  it('is a no-op with no splits', () => {
    const { mapping, applied } = applyScopeSplits(parsed, [])
    expect(applied).toEqual([])
    expect(mapping).toBe(parsed)
  })

  it('replaces the original with its parts, in place', () => {
    const { mapping } = applyScopeSplits(parsed, [split([part(), other()])])
    const ids = mapping.features.map((f) => f.id)
    expect(ids).toContain('F-085')
    expect(ids).toContain('F-093')
    // F-093 sits immediately after F-085, not appended at the end.
    expect(ids.indexOf('F-093')).toBe(ids.indexOf('F-085') + 1)
    expect(mapping.features).toHaveLength(parsed.features.length + 1)
  })

  it('routes capabilities by their MVP ref', () => {
    const { mapping } = applyScopeSplits(parsed, [split([part(), other()])])
    const a = mapping.features.find((f) => f.id === 'F-085')!
    const b = mapping.features.find((f) => f.id === 'F-093')!
    expect(a.capabilities.map((c) => c.ref)).toEqual([972])
    expect(b.capabilities.map((c) => c.ref)).toEqual([990, 990])
  })

  it('refuses to leave an MVP ref unassigned', () => {
    expect(() => applyScopeSplits(parsed, [split([part(), other({ mvpRefs: [] })])])).toThrow(
      /leaves MVP ref\(s\) 990 unassigned/,
    )
  })

  it('refuses a ref the original does not cite', () => {
    expect(() =>
      applyScopeSplits(parsed, [split([part(), other({ mvpRefs: [990, 111] })])]),
    ).toThrow(/assigns MVP ref\(s\) 111 that F-085 does not cite/)
  })

  it('refuses to assign one ref to two parts', () => {
    expect(() =>
      applyScopeSplits(parsed, [split([part({ mvpRefs: [972, 990] }), other()])]),
    ).toThrow(/more than one part/)
  })

  it('refuses to leave an assumption unassigned', () => {
    expect(() =>
      applyScopeSplits(parsed, [split([part(), other({ assumptionPositions: [2] })])]),
    ).toThrow(/leaves assumption\(s\) 3 unassigned/)
  })

  it('refuses to create an id that already exists', () => {
    expect(() =>
      applyScopeSplits(parsed, [split([part(), other({ featureId: 'F-086' })])]),
    ).toThrow(/would create F-086, which already exists/)
  })

  it('refuses a split into fewer than two parts', () => {
    expect(() =>
      applyScopeSplits(parsed, [split([part({ mvpRefs: [972, 990], assumptionPositions: [1, 2, 3] })])]),
    ).toThrow(/at least two parts/)
  })

  it('refuses a target that does not exist', () => {
    expect(() =>
      applyScopeSplits(parsed, [{ ...split([part(), other()]), featureId: 'F-999' }]),
    ).toThrow(/F-999, which is not in the mapping document/)
  })

  it('refuses a part naming a non-canonical phase', () => {
    expect(() =>
      applyScopeSplits(parsed, [split([part({ phaseLabel: 'Invented' }), other()])]),
    ).toThrow(/Unrecognised phase label "Invented"/)
  })
})

describe('the declared splits', () => {
  it('all apply cleanly against the real document', () => {
    expect(() => applyScopeSplits(parsed, SCOPE_SPLITS)).not.toThrow()
  })

  it('each carry a rationale, a date and a well-formed id', () => {
    for (const s of SCOPE_SPLITS) {
      expect(s.rationale.length).toBeGreaterThan(20)
      expect(s.decidedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(s.id).toMatch(/^OV-\d{3}$/)
    }
  })

  it('do not collide with the placement override ids', () => {
    const ids = [...SCOPE_OVERRIDES.map((o) => o.id), ...SCOPE_SPLITS.map((s) => s.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })
})
