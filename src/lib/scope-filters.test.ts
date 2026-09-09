import { describe, expect, it } from 'vitest'
import { buildScopeMap } from '@/lib/scope-derive'
import {
  EMPTY_FILTERS,
  activeGroups,
  applyFilters,
  blameGroups,
  countForValue,
  isEmpty,
  matchesFilters,
  parseFilters,
  toggleValue,
  withoutGroup,
  writeFilters,
  type FilterState,
} from '@/lib/scope-filters'
import { makeScopeGraph } from '@/test/scope-fixture'

const model = buildScopeMap(makeScopeGraph())
const features = model.features
const ids = (state: FilterState) => applyFilters(features, state).map((f) => f.id)
const withFilters = (partial: Partial<FilterState>): FilterState => ({
  ...EMPTY_FILTERS,
  ...partial,
})

describe('matchesFilters — an empty group is no constraint', () => {
  it('matches everything with no filters', () => {
    expect(ids(EMPTY_FILTERS)).toEqual(['F-001', 'F-002'])
    expect(isEmpty(EMPTY_FILTERS)).toBe(true)
  })

  it('never treats an empty group as "match nothing"', () => {
    expect(features.every((f) => matchesFilters(f, EMPTY_FILTERS))).toBe(true)
  })
})

describe('matchesFilters — OR within a group', () => {
  it('matches any selected release', () => {
    expect(ids(withFilters({ release: ['1.1'] }))).toEqual(['F-001', 'F-002'])
    expect(ids(withFilters({ release: ['1.4'] }))).toEqual([])
    expect(ids(withFilters({ release: ['1.1', '1.4'] }))).toEqual(['F-001', 'F-002'])
  })

  it('matches a feature citing any selected actor', () => {
    // F-001 cites staff + employer; F-002 cites employer only.
    expect(ids(withFilters({ actor: ['staff'] }))).toEqual(['F-001'])
    expect(ids(withFilters({ actor: ['employer'] }))).toEqual(['F-001', 'F-002'])
    expect(ids(withFilters({ actor: ['jobseeker'] }))).toEqual([])
  })

  it('matches a feature citing any selected MVP ref', () => {
    expect(ids(withFilters({ mvp: [938] }))).toEqual(['F-001'])
    expect(ids(withFilters({ mvp: [948] }))).toEqual(['F-002'])
    expect(ids(withFilters({ mvp: [938, 948] }))).toEqual(['F-001', 'F-002'])
  })
})

describe('matchesFilters — AND across groups', () => {
  it('requires every active group to match', () => {
    expect(ids(withFilters({ release: ['1.1'], actor: ['staff'] }))).toEqual(['F-001'])
    // Release 1.4 has no features, so combining it with anything is empty.
    expect(ids(withFilters({ release: ['1.4'], actor: ['employer'] }))).toEqual([])
  })
})

describe('matchesFilters — scope option', () => {
  it('matches the bare record via "none"', () => {
    // F-001 holds 938 bare + 938 1A.
    expect(ids(withFilters({ option: ['none'] }))).toEqual(['F-001'])
  })

  it('matches an explicit option', () => {
    expect(ids(withFilters({ option: ['1A'] }))).toEqual(['F-001'])
    expect(ids(withFilters({ option: ['1B'] }))).toEqual(['F-002'])
  })
})

describe('matchesFilters — source (R-9.9)', () => {
  it('matches a feature by its provenance', () => {
    // Both fixture features are imported from the mapping file.
    expect(ids(withFilters({ source: ['mapping'] }))).toEqual(['F-001', 'F-002'])
    expect(ids(withFilters({ source: ['manual'] }))).toEqual([])
  })

  it('finds a row that was added or edited here', () => {
    const edited = buildScopeMap(
      makeScopeGraph({
        pwcFeatures: makeScopeGraph().pwcFeatures.map((f) =>
          f.id === 'F-002' ? { ...f, source: 'manual' } : f,
        ),
      }),
    )
    expect(
      applyFilters(edited.features, withFilters({ source: ['manual'] })).map((f) => f.id),
    ).toEqual(['F-002'])
  })

  it('ORs several sources together', () => {
    const mixed = buildScopeMap(
      makeScopeGraph({
        pwcFeatures: makeScopeGraph().pwcFeatures.map((f) =>
          f.id === 'F-002' ? { ...f, source: 'manual' } : f,
        ),
      }),
    )
    expect(
      applyFilters(mixed.features, withFilters({ source: ['mapping', 'manual'] })).map(
        (f) => f.id,
      ),
    ).toEqual(['F-001', 'F-002'])
  })
})

describe('matchesFilters — conflict state', () => {
  it('finds features with a release conflict', () => {
    expect(ids(withFilters({ conflict: ['release'] }))).toEqual(['F-002'])
  })

  it('finds features with an unmatched link', () => {
    expect(ids(withFilters({ conflict: ['unmatched'] }))).toEqual(['F-002'])
  })

  it('treats a merge-resolved phase conflict as no conflict', () => {
    // F-001's only phase conflict is resolved by the canonical merge.
    expect(ids(withFilters({ conflict: ['phase'] }))).toEqual(['F-002'])
    expect(ids(withFilters({ conflict: ['none'] }))).toEqual(['F-001'])
  })

  it('finds features whose source was corrected', () => {
    const corrected = buildScopeMap(
      makeScopeGraph({
        overrides: [
          { id: 'OV-001', featureId: 'F-002', rationale: 'r', decidedOn: 'd' },
        ],
      }),
    )
    expect(
      applyFilters(corrected.features, withFilters({ conflict: ['corrected'] })).map(
        (f) => f.id,
      ),
    ).toEqual(['F-002'])
  })
})

describe('countForValue — live result counts (R-8.9)', () => {
  it('answers "what happens if I click this"', () => {
    expect(countForValue(features, EMPTY_FILTERS, 'release', '1.1')).toBe(2)
    expect(countForValue(features, EMPTY_FILTERS, 'release', '1.4')).toBe(0)
  })

  it('respects the other active groups', () => {
    const state = withFilters({ actor: ['staff'] })
    // Only F-001 cites staff, so release 1.1 yields 1 here, not 2.
    expect(countForValue(features, state, 'release', '1.1')).toBe(1)
  })

  it('ignores the group being counted, so a sibling does not suppress it', () => {
    const state = withFilters({ release: ['1.4'] })
    // Counting release 1.1 must not AND with release 1.4.
    expect(countForValue(features, state, 'release', '1.1')).toBe(2)
  })
})

describe('blameGroups — zero-result attribution (R-8.10)', () => {
  it('is empty when there are results', () => {
    expect(blameGroups(features, EMPTY_FILTERS)).toEqual([])
  })

  it('names the single group responsible', () => {
    expect(blameGroups(features, withFilters({ actor: ['jobseeker'] }))).toEqual(['actor'])
  })

  it('blames only the group whose removal actually restores results', () => {
    // Dropping release still leaves actor=jobseeker, which matches nothing,
    // so release is not to blame even though it is active.
    const state = withFilters({ release: ['1.1'], actor: ['jobseeker'] })
    expect(blameGroups(features, state)).toEqual(['actor'])
  })

  it('names several groups when dropping any one of them works', () => {
    // actor=staff matches only F-001 and option=1B only F-002, so together
    // they are empty while either alone has results — both are to blame.
    const state = withFilters({ actor: ['staff'], option: ['1B'] })
    expect(blameGroups(features, state).sort()).toEqual(['actor', 'option'])
  })

  it('does not blame a group whose removal leaves the view still empty', () => {
    // Dropping release leaves actor=jobseeker, which matches nothing.
    const state = withFilters({ release: ['1.4'], actor: ['jobseeker'] })
    expect(blameGroups(features, state)).toEqual([])
  })

  it('returns nothing to blame when only the combination is at fault', () => {
    // Each of these has results alone; together they do not, and dropping
    // just one still leaves an impossible pair.
    const state = withFilters({
      release: ['1.4'],
      phase: ['manage-vacancies'],
      actor: ['jobseeker'],
    })
    expect(blameGroups(features, state)).toEqual([])
  })
})

describe('URL round trip — the URL is the source of truth (R-10.2)', () => {
  it('writes only the active groups', () => {
    const params = writeFilters(withFilters({ release: ['1.1'], actor: ['staff'] }))
    expect(params.get('release')).toBe('1.1')
    expect(params.get('actor')).toBe('staff')
    expect(params.get('phase')).toBeNull()
  })

  it('round-trips every group', () => {
    const state = withFilters({
      release: ['1.1', '1.4'],
      phase: ['manage-vacancies'],
      actor: ['staff', 'employer'],
      mvp: [938, 948],
      option: ['1A', 'none'],
      conflict: ['release'],
      source: ['manual'],
    })
    expect(parseFilters(writeFilters(state))).toEqual(state)
  })

  it('clears a group from the URL when it empties', () => {
    const params = writeFilters(
      withFilters({ release: [] }),
      new URLSearchParams('release=1.1'),
    )
    expect(params.get('release')).toBeNull()
  })

  it('preserves params it does not own', () => {
    const params = writeFilters(
      withFilters({ release: ['1.1'] }),
      new URLSearchParams('q=vacancy&selected=F-001'),
    )
    expect(params.get('q')).toBe('vacancy')
    expect(params.get('selected')).toBe('F-001')
  })

  it('drops values that are not valid for their group', () => {
    const state = parseFilters(
      new URLSearchParams(
        'actor=wizard,staff&option=1C&conflict=nope&source=invented&mvp=abc',
      ),
    )
    expect(state.actor).toEqual(['staff'])
    expect(state.option).toEqual([])
    expect(state.conflict).toEqual([])
    expect(state.source).toEqual([])
    expect(state.mvp).toEqual([])
  })

  it('reads an empty URL as no filters', () => {
    expect(parseFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS)
  })
})

describe('helpers', () => {
  it('toggles a value in and out', () => {
    expect(toggleValue(['1.1'], '1.2')).toEqual(['1.1', '1.2'])
    expect(toggleValue(['1.1', '1.2'], '1.1')).toEqual(['1.2'])
  })

  it('lists the active groups', () => {
    expect(activeGroups(withFilters({ release: ['1.1'], mvp: [938] }))).toEqual([
      'release',
      'mvp',
    ])
  })

  it('clears one group without touching the rest', () => {
    const state = withFilters({ release: ['1.1'], actor: ['staff'] })
    expect(withoutGroup(state, 'release')).toEqual(withFilters({ actor: ['staff'] }))
  })
})
