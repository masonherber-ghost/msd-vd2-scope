import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMappingDocument } from './mapping-parser.js'
import { MAPPING_PATH } from './scope-source.js'
import {
  SCOPE_OVERRIDES,
  applyScopeOverrides,
  type ScopeOverride,
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
