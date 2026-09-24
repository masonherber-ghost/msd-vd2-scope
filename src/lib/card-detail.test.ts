import { describe, expect, it } from 'vitest'
import {
  ALL_DETAIL,
  DETAIL_PARAM,
  detailGroupsFor,
  hiddenCount,
  parseDetail,
  toggleDetail,
  writeDetail,
} from '@/lib/card-detail'

const params = (query: string) => new URLSearchParams(query)

describe('detailGroupsFor — the toggles follow the cards', () => {
  it('offers every region on a PwC feature card', () => {
    expect(detailGroupsFor('release').map((g) => g.key)).toEqual([
      'release',
      'refs',
      'actors',
      'capabilities',
      'conflicts',
      'questions',
    ])
  })

  it('offers the same set in actor view, where the card is the same', () => {
    expect(detailGroupsFor('actor')).toEqual(detailGroupsFor('release'))
  })

  it('names the same key for what it is in each view', () => {
    // `refs` is the row of links to the other side of the model, which is a
    // different thing in each view, so it cannot share one label.
    const label = (view: 'release' | 'mvp' | 'capability') =>
      detailGroupsFor(view).find((g) => g.key === 'refs')?.label
    expect(label('mvp')).toBe('PwC features')
    expect(label('release')).toBe('MSD features')
    expect(label('capability')).toBe('MSD feature')
  })

  it('offers the five the MSD card draws', () => {
    expect(detailGroupsFor('mvp').map((g) => g.label)).toEqual([
      'Release',
      'PwC features',
      'Actors',
      'Capabilities',
      'Questions',
    ])
  })

  it('offers only what a capability card draws', () => {
    // A capability card carries no release pill and no capability count — a
    // toggle that changed nothing would be worse than no toggle.
    expect(detailGroupsFor('capability').map((g) => g.key)).toEqual([
      'actors',
      'refs',
      'conflicts',
      'questions',
    ])
  })

  it('gives questions their own toggle in every view', () => {
    // A question is a person's open item, separate from the source
    // disagreements it would otherwise be buried among.
    for (const view of ['release', 'actor', 'mvp', 'capability'] as const) {
      expect(detailGroupsFor(view).some((g) => g.key === 'questions')).toBe(true)
    }
  })

  it('gives every toggle a hint saying what disappears', () => {
    for (const view of ['release', 'actor', 'mvp', 'capability'] as const) {
      for (const group of detailGroupsFor(view)) {
        expect(group.hint.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('parseDetail — the URL lists what is hidden', () => {
  it('shows everything when the param is absent', () => {
    expect(parseDetail(params(''))).toEqual(ALL_DETAIL)
  })

  it('hides exactly what is named', () => {
    expect(parseDetail(params(`${DETAIL_PARAM}=refs,actors`))).toEqual({
      ...ALL_DETAIL,
      refs: false,
      actors: false,
    })
  })

  it('ignores a key it does not recognise rather than throwing', () => {
    expect(parseDetail(params(`${DETAIL_PARAM}=refs,nonsense`))).toEqual({
      ...ALL_DETAIL,
      refs: false,
    })
  })

  it('tolerates spaces and empty entries from a hand-typed link', () => {
    expect(parseDetail(params(`${DETAIL_PARAM}=  refs , ,questions `))).toEqual({
      ...ALL_DETAIL,
      refs: false,
      questions: false,
    })
  })
})

describe('writeDetail — round-trips through the URL', () => {
  it('writes nothing when everything is shown, keeping a shared link short', () => {
    expect(writeDetail(ALL_DETAIL).toString()).toBe('')
  })

  it('names the hidden regions', () => {
    const written = writeDetail({ ...ALL_DETAIL, release: false, questions: false })
    expect(written.get(DETAIL_PARAM)).toBe('release,questions')
  })

  it('preserves params it does not own', () => {
    // Filters, view and selection share the query string.
    const written = writeDetail(
      { ...ALL_DETAIL, refs: false },
      params('view=mvp&release=1.1&selected=F-001'),
    )
    expect(written.get('view')).toBe('mvp')
    expect(written.get('release')).toBe('1.1')
    expect(written.get('selected')).toBe('F-001')
  })

  it('clears the param when the last hidden region comes back', () => {
    const written = writeDetail(ALL_DETAIL, params(`${DETAIL_PARAM}=refs`))
    expect(written.has(DETAIL_PARAM)).toBe(false)
  })

  it('survives a round trip', () => {
    const state = { ...ALL_DETAIL, release: false, actors: false, questions: false }
    expect(parseDetail(writeDetail(state))).toEqual(state)
  })
})

describe('toggleDetail and hiddenCount', () => {
  it('flips one region and leaves the rest alone', () => {
    expect(toggleDetail(ALL_DETAIL, 'actors')).toEqual({ ...ALL_DETAIL, actors: false })
  })

  it('counts only the toggles this view offers', () => {
    // `release` is hidden, but a capability card draws no release pill — so
    // as far as the capability view is concerned nothing is hidden.
    const state = { ...ALL_DETAIL, release: false }
    expect(hiddenCount('release', state)).toBe(1)
    expect(hiddenCount('capability', state)).toBe(0)
  })

  it('counts nothing when everything is shown', () => {
    expect(hiddenCount('mvp', ALL_DETAIL)).toBe(0)
  })
})
