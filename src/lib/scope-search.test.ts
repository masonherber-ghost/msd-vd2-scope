import { describe, expect, it } from 'vitest'
import { EMPTY_SEARCH, searchScope } from '@/lib/scope-search'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph({
  assumptions: [
    {
      id: 1,
      pwc_feature_id: 'F-001',
      position: 1,
      text: 'Assumes out-of-the-box Salesforce capability for saving an Omniscript.',
      source: 'mapping',
    },
  ],
})

const search = (query: string) => searchScope(graph, query)
const kinds = (query: string) => search(query).groups.map((g) => g.kind)

describe('searchScope — nothing to search', () => {
  it('returns nothing for an empty query', () => {
    expect(search('')).toEqual(EMPTY_SEARCH)
    expect(search('   ')).toEqual(EMPTY_SEARCH)
  })

  it('says so when nothing matches', () => {
    expect(search('zzzz').total).toBe(0)
  })
})

describe('searchScope — what it looks at (R-8.11)', () => {
  it('finds a feature by id', () => {
    const result = search('F-002')
    expect(kinds('F-002')).toContain('feature-id')
    expect(result.groups[0].hits[0].featureId).toBe('F-002')
  })

  it('finds a feature by name', () => {
    expect(kinds('Verify employer')).toContain('feature-name')
  })

  it('finds foundational-build text', () => {
    const withBuild = searchScope(
      makeScopeGraph({
        pwcFeatures: graph.pwcFeatures.map((f) =>
          f.id === 'F-001' ? { ...f, foundational_build: 'Staff invite an employer.' } : f,
        ),
      }),
      'Staff invite',
    )
    expect(withBuild.groups.map((g) => g.kind)).toContain('foundational-build')
  })

  it('finds an MVP feature by ref', () => {
    expect(kinds('948')).toContain('mvp-ref')
  })

  it('finds an MVP feature by title', () => {
    expect(kinds('Verification methods')).toContain('mvp-title')
  })

  it('finds a capability by its text', () => {
    expect(kinds('Electronic T&Cs')).toContain('capability')
  })

  it('finds an assumption by its text', () => {
    const result = search('Omniscript')
    expect(result.groups.map((g) => g.kind)).toEqual(['assumption'])
    expect(result.groups[0].hits[0]).toMatchObject({
      featureId: 'F-001',
      title: 'F-001 · assumption 1',
    })
  })

  it('finds a phase by its epic ref', () => {
    const result = search('179')
    expect(result.groups.map((g) => g.kind)).toContain('epic-ref')
    expect(
      result.groups.find((g) => g.kind === 'epic-ref')?.hits[0].title,
    ).toBe('Access & Onboarding')
  })

  it('is case-insensitive', () => {
    expect(search('verify employer').total).toBeGreaterThan(0)
    expect(search('VERIFY EMPLOYER').total).toBeGreaterThan(0)
  })
})

describe('searchScope — grouping (R-8.12)', () => {
  it('separates hits by what matched', () => {
    // "938" is an MVP ref; it is not a feature id or a capability.
    const result = search('938')
    expect(result.groups.map((g) => g.kind)).toEqual(['mvp-ref'])
  })

  it('orders the most direct hit first', () => {
    const result = search('e')
    const order = result.groups.map((g) => g.kind)
    expect(order.indexOf('feature-name')).toBeLessThan(order.indexOf('assumption'))
  })

  it('flattens in group order, which is what the arrows walk', () => {
    const result = search('e')
    expect(result.flat).toHaveLength(result.total)
    expect(result.flat[0]).toEqual(result.groups[0].hits[0])
  })
})

describe('searchScope — where Enter goes (R-8.13)', () => {
  it('resolves an MVP hit to a feature citing it', () => {
    const hit = search('948').groups[0].hits[0]
    expect(hit.featureId).toBe('F-002')
  })

  it('resolves a capability hit to a feature citing it', () => {
    const hit = search('Electronic T&Cs').groups[0].hits[0]
    expect(hit.featureId).toBe('F-002')
  })

  it('leaves an epic hit with no feature, since a phase is not on the map', () => {
    const hit = search('179').groups.find((g) => g.kind === 'epic-ref')!.hits[0]
    expect(hit.featureId).toBeNull()
  })

  it('never points at a feature that is not in the graph', () => {
    const orphaned = searchScope(
      makeScopeGraph({
        featureMvpLinks: [
          { pwc_feature_id: 'F-404', mvp_feature_id: 3, source: 'mapping' },
        ],
      }),
      '948',
    )
    for (const hit of orphaned.flat) {
      expect(hit.featureId === null || hit.featureId.startsWith('F-0')).toBe(true)
      if (hit.featureId) expect(hit.featureId).not.toBe('F-404')
    }
  })
})

describe('searchScope — highlighting', () => {
  it('reports where the term sits in its context', () => {
    const hit = search('employer').groups[0].hits[0]
    expect(hit.context.slice(hit.matchStart, hit.matchStart + hit.matchLength).toLowerCase()).toBe(
      'employer',
    )
  })

  it('keeps the original casing of the surrounding text', () => {
    const hit = search('verify').groups.find((g) => g.kind === 'feature-name')!.hits[0]
    expect(hit.context).toBe('Verify employer')
  })
})
