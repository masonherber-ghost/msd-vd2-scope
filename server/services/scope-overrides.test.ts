import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMappingDocument } from './mapping-parser.js'
import { parseSequencingTable } from './sequencing-parser.js'
import { MAPPING_PATH, SEQUENCING_PATH } from './scope-source.js'
import {
  MVP_OPTION_MERGES,
  OPTION_LABEL,
  RELEASE_ALIASES,
  RELEASE_REALLOCATIONS,
  applyMvpOptionSplits,
  applyReleaseReallocations,
  type MvpOptionMerge,
  type ReleaseReallocation,
  SCOPE_OVERRIDES,
  SCOPE_SPLITS,
  applyReleaseAliases,
  applyScopeOverrides,
  applyScopeSplits,
  type ReleaseAlias,
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


describe('applyReleaseAliases', () => {
  const alias: ReleaseAlias = {
    id: 'OV-TEST',
    from: '1.9',
    to: '1.4',
    rationale: 'test',
    decidedOn: '2026-09-11',
  }

  it('is a no-op when there are no aliases', () => {
    const { mapping, applied } = applyReleaseAliases(parsed, [])
    expect(applied).toEqual([])
    expect(mapping).toBe(parsed)
  })

  it('renames the release and every feature filed under it', () => {
    const before = parsed.features.filter((f) => f.releaseId === '1.9')
    expect(before.length).toBeGreaterThan(0)

    const { mapping, applied } = applyReleaseAliases(parsed, [alias])

    expect(mapping.releases.map((r) => r.id)).not.toContain('1.9')
    expect(mapping.features.some((f) => f.releaseId === '1.9')).toBe(false)
    expect(mapping.features.filter((f) => f.releaseId === '1.4')).toHaveLength(
      before.length,
    )
    expect(applied[0].features).toEqual(before.map((f) => f.id))
  })

  it('relabels the release but keeps its prose', () => {
    const source = parsed.releases.find((r) => r.id === '1.9')!
    const { mapping } = applyReleaseAliases(parsed, [alias])
    const renamed = mapping.releases.find((r) => r.id === '1.4')!

    expect(renamed.label).toBe('Release 1.4')
    expect(renamed.name).toBe(source.name)
    expect(renamed.description).toBe(source.description)
  })

  it('leaves other releases and their features alone', () => {
    const { mapping } = applyReleaseAliases(parsed, [alias])
    for (const id of ['1.1', '1.2', '1.3']) {
      expect(mapping.releases.some((r) => r.id === id)).toBe(true)
      expect(mapping.features.filter((f) => f.releaseId === id)).toHaveLength(
        parsed.features.filter((f) => f.releaseId === id).length,
      )
    }
  })

  it('does not mutate the input', () => {
    applyReleaseAliases(parsed, [alias])
    expect(parsed.releases.some((r) => r.id === '1.9')).toBe(true)
    expect(parsed.features.some((f) => f.releaseId === '1.9')).toBe(true)
  })

  it('rejects an alias for a release the mapping document does not have', () => {
    expect(() =>
      applyReleaseAliases(parsed, [{ ...alias, from: '9.9' }]),
    ).toThrow(/9\.9/)
  })

  it('rejects an alias that renames a release to itself', () => {
    expect(() => applyReleaseAliases(parsed, [{ ...alias, to: '1.9' }])).toThrow(
      /itself/,
    )
  })

  it('every declared alias targets a release the mapping document has', () => {
    for (const declared of RELEASE_ALIASES) {
      expect(parsed.releases.some((r) => r.id === declared.from)).toBe(true)
      expect(declared.rationale.length).toBeGreaterThan(0)
    }
  })
})

describe('applyReleaseReallocations', () => {
  const sequencing = parseSequencingTable(fs.readFileSync(SEQUENCING_PATH, 'utf8'))
  const move = (over: Partial<ReleaseReallocation> = {}): ReleaseReallocation => ({
    id: 'OV-TEST',
    refs: [938],
    from: '1.1',
    to: '1.2',
    rationale: 'test',
    decidedOn: '2026-09-11',
    ...over,
  })

  it('is a no-op when there is nothing to reallocate', () => {
    const { sequencing: out, applied } = applyReleaseReallocations(sequencing, [])
    expect(applied).toEqual([])
    expect(out).toBe(sequencing)
  })

  it('moves every capability of the ref out of the release', () => {
    const before = sequencing.capabilities.filter(
      (c) => c.ref === 938 && c.releaseId === '1.1',
    )
    expect(before.length).toBeGreaterThan(0)

    const { sequencing: out, applied } = applyReleaseReallocations(sequencing, [move()])

    expect(out.capabilities.some((c) => c.ref === 938 && c.releaseId === '1.1')).toBe(false)
    expect(
      out.capabilities.filter((c) => c.ref === 938 && c.releaseId === '1.2'),
    ).toHaveLength(before.length)
    expect(applied[0].moved).toEqual([{ ref: 938, capabilities: before.length }])
  })

  it('leaves the phase alone — a release says when, not where', () => {
    const before = sequencing.capabilities.filter((c) => c.ref === 938)
    const { sequencing: out } = applyReleaseReallocations(sequencing, [move()])
    const after = out.capabilities.filter((c) => c.ref === 938)
    expect(after.map((c) => c.phaseId)).toEqual(before.map((c) => c.phaseId))
    expect(after.map((c) => c.text)).toEqual(before.map((c) => c.text))
  })

  it('touches no other ref', () => {
    const { sequencing: out } = applyReleaseReallocations(sequencing, [move()])
    const others = (list: typeof sequencing.capabilities) =>
      list.filter((c) => c.ref !== 938).map((c) => `${c.ref}|${c.text}|${c.releaseId}`)
    expect(others(out.capabilities)).toEqual(others(sequencing.capabilities))
  })

  it('does not mutate the input', () => {
    applyReleaseReallocations(sequencing, [move()])
    expect(sequencing.capabilities.some((c) => c.ref === 938 && c.releaseId === '1.1')).toBe(
      true,
    )
  })

  it('refuses a reallocation that would move nothing', () => {
    // A stale declaration is worse than none: it reads as applied.
    expect(() => applyReleaseReallocations(sequencing, [move({ from: '1.3' })])).toThrow(
      /938/,
    )
  })

  it('refuses a reallocation to the release it is already in', () => {
    expect(() => applyReleaseReallocations(sequencing, [move({ to: '1.1' })])).toThrow(
      /its own release/,
    )
  })

  it('every declared reallocation moves at least one capability', () => {
    // Guards against a source change silently emptying one of them.
    expect(() => applyReleaseReallocations(sequencing, RELEASE_REALLOCATIONS)).not.toThrow()
  })

  it('leaves release 1.1 holding exactly the twelve approved refs', () => {
    const APPROVED = [939, 940, 941, 944, 946, 947, 955, 959, 962, 968, 972, 991]
    const { sequencing: out } = applyReleaseReallocations(sequencing, RELEASE_REALLOCATIONS)
    const in11 = [
      ...new Set(out.capabilities.filter((c) => c.releaseId === '1.1').map((c) => c.ref)),
    ].sort((a, b) => a - b)
    expect(in11).toEqual(APPROVED)
  })
})

describe('applyMvpOptionSplits', () => {
  const merge = (over: Partial<MvpOptionMerge> = {}): MvpOptionMerge => ({
    id: 'OV-TEST',
    ref: 938,
    into: '1A',
    rationale: 'test',
    decidedOn: '2026-09-11',
    ...over,
  })

  const citations = (result: typeof parsed, ref: number) =>
    result.features.flatMap((f) =>
      f.mvpFeatures.filter((m) => m.ref === ref).map((m) => `${f.id}|${m.scopeOption ?? ''}`),
    )

  it('resolves a bare citation onto the option it belongs to', () => {
    expect(citations(parsed, 938)).toContain('F-003|')

    const { mapping, applied } = applyMvpOptionSplits(parsed, [merge()])

    expect(citations(mapping, 938)).not.toContain('F-003|')
    expect(citations(mapping, 938)).toContain('F-003|1A')
    expect(applied[0].features).toEqual(['F-003'])
  })

  it('leaves the ref with one record where it had two', () => {
    const { mapping } = applyMvpOptionSplits(parsed, [merge()])
    const options = new Set(
      mapping.features.flatMap((f) =>
        f.mvpFeatures.filter((m) => m.ref === 938).map((m) => m.scopeOption),
      ),
    )
    expect([...options]).toEqual(['1A'])
  })

  it('labels every optioned record so A and B read as different features', () => {
    const { mapping } = applyMvpOptionSplits(parsed, [merge()])
    const titles = new Map(
      mapping.features.flatMap((f) =>
        f.mvpFeatures.map((m) => [`${m.ref}|${m.scopeOption ?? ''}`, m.title] as const),
      ),
    )
    // 951's two options carry the same title in the source; the label is the
    // only thing that tells them apart.
    expect(titles.get('951|1A')).toMatch(/\(Option A\)$/)
    expect(titles.get('951|1B')).toMatch(/\(Option B\)$/)
    expect(titles.get('951|1A')).not.toBe(titles.get('951|1B'))
  })

  it('leaves an unoptioned title untouched', () => {
    const { mapping } = applyMvpOptionSplits(parsed, [merge()])
    const bare = mapping.features
      .flatMap((f) => f.mvpFeatures)
      .filter((m) => m.scopeOption === null)
    expect(bare.length).toBeGreaterThan(0)
    expect(bare.every((m) => !/\(Option [AB]\)$/.test(m.title))).toBe(true)
  })

  it('is idempotent — a second pass does not double-label', () => {
    const once = applyMvpOptionSplits(parsed, [merge()]).mapping
    const twice = applyMvpOptionSplits(once, [merge({ ref: 946 })]).mapping
    const label951 = twice.features
      .flatMap((f) => f.mvpFeatures)
      .find((m) => m.ref === 951 && m.scopeOption === '1B')!
    expect(label951.title.match(/\(Option B\)/g)).toHaveLength(1)
  })

  it('uses the labels the UI shows', () => {
    expect(OPTION_LABEL).toEqual({ '1A': 'Option A', '1B': 'Option B' })
  })

  it('refuses a merge for a ref the document never cites bare', () => {
    // 951 has 1A and 1B and no bare citation, so merging it would be a lie.
    expect(() => applyMvpOptionSplits(parsed, [merge({ ref: 951 })])).toThrow(/951/)
  })

  it('every declared merge targets a ref that is actually cited bare', () => {
    expect(() => applyMvpOptionSplits(parsed, MVP_OPTION_MERGES)).not.toThrow()
  })

  it('never drops a citation', () => {
    const before = parsed.features.reduce((n, f) => n + f.mvpFeatures.length, 0)
    const { mapping } = applyMvpOptionSplits(parsed, MVP_OPTION_MERGES)
    const after = mapping.features.reduce((n, f) => n + f.mvpFeatures.length, 0)
    // No feature cites both the bare and the optioned record of one ref, so
    // nothing collapses and the link count is unchanged.
    expect(after).toBe(before)
  })
})
