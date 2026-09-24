import { describe, expect, it } from 'vitest'
import { buildCapabilityCards } from '@/lib/capability-derive'
import { buildMvpCards } from '@/lib/mvp-derive'
import { buildScopeExport, describeFilters } from '@/lib/scope-export'
import { buildScopeMap, type ViewMode } from '@/lib/scope-derive'
import { EMPTY_FILTERS, type FilterState } from '@/lib/scope-filters'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph()
const model = buildScopeMap(graph)

const exportFor = (view: ViewMode, filters: FilterState = EMPTY_FILTERS, override = {}) =>
  buildScopeExport({
    view,
    releases: model.releases,
    phases: model.phases,
    filters,
    features: model.features,
    mvpCards: buildMvpCards(graph),
    capabilityCards: buildCapabilityCards(graph),
    ...override,
  })

describe('buildScopeExport — document shape', () => {
  it('opens with the title, span and view the source document uses', () => {
    const { markdown } = exportFor('mvp')
    expect(markdown.split('\n').slice(0, 5)).toEqual([
      '# Scope for VD2',
      '',
      'Including releases 1.1 – 1.4',
      '',
      'View by MSD feature',
    ])
  })

  it('names the view it was taken from', () => {
    expect(exportFor('release').markdown).toContain('View by PwC release')
    expect(exportFor('actor').markdown).toContain('View by actor')
    expect(exportFor('capability').markdown).toContain('View by capability')
  })

  it('heads each release section with its number, label and name', () => {
    expect(exportFor('release').markdown).toContain('## **1. Release 1.1 — Pilot**')
  })

  it('falls back to the label alone for a release with no name', () => {
    const { markdown } = exportFor('capability')
    expect(markdown).toContain('## **2. Release 1.4**')
  })

  it('heads each phase with its epic, as the source document does', () => {
    expect(exportFor('release').markdown).toContain(
      '#### **Access & Onboarding *(TPT179 – Employer registration)***',
    )
  })

  it('heads a phase with no epic by its name alone', () => {
    // "Portal structure & navigation" in the source document carries no epic
    // ref, so the parenthetical has to disappear rather than render empty.
    const noEpic = makeScopeGraph({
      phases: graph.phases.map((p) =>
        p.id === 'access-and-onboarding'
          ? { ...p, epic_ref: '', epic_description: '' }
          : p,
      ),
    })
    const noEpicModel = buildScopeMap(noEpic)
    const { markdown } = buildScopeExport({
      view: 'release',
      releases: noEpicModel.releases,
      phases: noEpicModel.phases,
      filters: EMPTY_FILTERS,
      features: noEpicModel.features,
      mvpCards: [],
      capabilityCards: [],
    })
    expect(markdown).toContain('#### **Access & Onboarding**')
    expect(markdown).not.toContain('TPT')
  })

  it('names the file after the view', () => {
    expect(exportFor('mvp').filename).toBe('vd2-scope-by-msd-feature.md')
    expect(exportFor('actor').filename).toBe('vd2-scope-by-actor.md')
  })

  it('marks a filtered export in its filename', () => {
    // Otherwise a full export and a narrow one land in Downloads under the
    // same name and the browser silently suffixes one of them.
    expect(exportFor('mvp', { ...EMPTY_FILTERS, release: ['1.1'] }).filename).toBe(
      'vd2-scope-by-msd-feature-filtered.md',
    )
  })

  it('dates the export only when the caller supplies the time', () => {
    expect(exportFor('release').markdown).not.toContain('exported')
    expect(
      exportFor('release', EMPTY_FILTERS, { generatedAt: new Date(2026, 8, 24) }).markdown,
    ).toContain('2 PwC features · exported 2026-09-24')
  })
})

describe('buildScopeExport — bullets', () => {
  it('writes a PwC feature as its id, name and the MSD refs it cites', () => {
    expect(exportFor('release').markdown).toContain(
      '* **F-001**: Invite employer *(SVD-938, SVD-938 (Option 1A))*',
    )
  })

  it('writes an MSD feature as its SVD ref and title', () => {
    expect(exportFor('mvp').markdown).toContain('* **SVD-938**: Additional users')
  })

  it('carries the scope option on a variant record', () => {
    expect(exportFor('mvp').markdown).toContain(
      '* **SVD-948 (Option 1B)**: Verification methods',
    )
  })

  it('writes a capability with its actor', () => {
    expect(exportFor('capability').markdown).toContain(
      '* **SVD-938**: Invite employer to register *(MSD staff)*',
    )
  })

  it('keeps an open question on the capability that carries it', () => {
    const questioned = makeScopeGraph({
      capabilities: graph.capabilities.map((c) =>
        c.id === 10 ? { ...c, question: 'Which inbox sends this?' } : c,
      ),
    })
    const { markdown } = buildScopeExport({
      view: 'capability',
      releases: model.releases,
      phases: model.phases,
      filters: EMPTY_FILTERS,
      features: model.features,
      mvpCards: buildMvpCards(questioned),
      capabilityCards: buildCapabilityCards(questioned),
    })
    expect(markdown).toContain('**Question:** Which inbox sends this?')
  })
})

describe('buildScopeExport — grouping', () => {
  it('orders phases by the journey, not by the order cards arrived in', () => {
    const { markdown } = exportFor('capability')
    expect(markdown.indexOf('Access & Onboarding')).toBeLessThan(
      markdown.indexOf('Manage Vacancies'),
    )
  })

  it('omits a phase nothing lands in', () => {
    // Release 1.1 holds nothing in Manage Vacancies, so that heading should
    // not appear before the 1.4 section starts.
    const { markdown } = exportFor('capability')
    const firstSection = markdown.slice(
      markdown.indexOf('## **1. Release 1.1'),
      markdown.indexOf('## **2. Release 1.4'),
    )
    expect(firstSection).not.toContain('Manage Vacancies')
  })

  it('omits a release nothing lands in', () => {
    // No PwC feature ships in 1.4, so the feature view has no 1.4 section.
    expect(exportFor('release').markdown).not.toContain('Release 1.4')
  })

  it('groups by actor in actor view, repeating a feature per actor', () => {
    const { markdown } = exportFor('actor')
    expect(markdown).toContain('## **Employers**')
    expect(markdown).toContain('## **MSD staff**')
    // F-001 cites a staff capability and an employer one, so it is in both.
    expect(markdown.match(/\* \*\*F-001\*\*/g)).toHaveLength(2)
  })

  it('counts records rather than bullets where one repeats across sections', () => {
    // F-001 is listed under two actors; that is one feature, two entries.
    const { markdown } = exportFor('actor')
    expect(markdown).toContain('2 PwC features · 3 entries (some appear in more than one section)')
  })

  it('lists a feature with no capabilities under the no-actor row', () => {
    const bare = makeScopeGraph({ featureCapabilityLinks: [] })
    const bareModel = buildScopeMap(bare)
    const { markdown } = buildScopeExport({
      view: 'actor',
      releases: bareModel.releases,
      phases: bareModel.phases,
      filters: EMPTY_FILTERS,
      features: bareModel.features,
      mvpCards: buildMvpCards(bare),
      capabilityCards: buildCapabilityCards(bare),
    })
    expect(markdown).toContain('## **No actor recorded**')
  })
})

describe('buildScopeExport — records nothing places', () => {
  it('lists an unplaced MSD feature rather than dropping it', () => {
    // An MSD record with no capabilities and no citing feature reaches no
    // cell at all.
    const orphan = makeScopeGraph({
      mvpFeatures: [
        ...graph.mvpFeatures,
        { id: 9, ref: 953, scope_option: null, title: 'Compliance view', source: 'sequencing' },
      ],
    })
    const { markdown } = buildScopeExport({
      view: 'mvp',
      releases: model.releases,
      phases: model.phases,
      filters: EMPTY_FILTERS,
      features: model.features,
      mvpCards: buildMvpCards(orphan),
      capabilityCards: buildCapabilityCards(orphan),
    })
    expect(markdown).toContain('## **Not on the map**')
    expect(markdown).toContain('* **SVD-953**: Compliance view')
  })

  it('files a capability missing a phase where the map files it — off the map', () => {
    // A cell needs both a release and a phase, so `projectCapabilityCells`
    // treats a half-placed capability as unplaced. The document says the
    // same thing, or it would disagree with the screen it was taken from.
    const noPhase = makeScopeGraph({
      capabilities: graph.capabilities.map((c) =>
        c.id === 12 ? { ...c, phase_id: null } : c,
      ),
    })
    const { markdown } = buildScopeExport({
      view: 'capability',
      releases: model.releases,
      phases: model.phases,
      filters: EMPTY_FILTERS,
      features: model.features,
      mvpCards: buildMvpCards(noPhase),
      capabilityCards: buildCapabilityCards(noPhase),
    })
    expect(markdown).toContain('## **Not on the map**')
    expect(markdown).toContain('* **SVD-948**: Electronic T&Cs acceptance')
    // Release 1.4 held nothing else, so it gets no section of its own.
    expect(markdown).not.toContain('## **2. Release 1.4**')
  })
})

describe('buildScopeExport — filters', () => {
  it('exports only what the filters left visible', () => {
    const filtered = buildScopeExport({
      view: 'release',
      releases: model.releases,
      phases: model.phases,
      filters: { ...EMPTY_FILTERS, feature: ['F-001'] },
      features: model.features.filter((f) => f.id === 'F-001'),
      mvpCards: [],
      capabilityCards: [],
    })
    expect(filtered.markdown).toContain('* **F-001**')
    expect(filtered.markdown).not.toContain('* **F-002**')
  })

  it('states the narrowing in words so the list is not read as the whole scope', () => {
    const filtered = exportFor('release', { ...EMPTY_FILTERS, release: ['1.1'], actor: ['staff'] })
    expect(filtered.markdown).toContain('Filtered by — Release: Release 1.1 · Actor: MSD staff')
  })

  it('says nothing about filters when none are active', () => {
    expect(exportFor('release').markdown).not.toContain('Filtered by')
  })

  it('narrows the release span to what survived', () => {
    const filtered = buildScopeExport({
      view: 'capability',
      releases: model.releases,
      phases: model.phases,
      filters: { ...EMPTY_FILTERS, release: ['1.4'] },
      features: [],
      mvpCards: [],
      capabilityCards: buildCapabilityCards(graph).filter((c) => c.releaseId === '1.4'),
    })
    expect(filtered.markdown).toContain('Including release 1.4')
  })

  it('explains an empty result instead of returning bare headings', () => {
    const empty = buildScopeExport({
      view: 'mvp',
      releases: model.releases,
      phases: model.phases,
      filters: { ...EMPTY_FILTERS, mvp: [999] },
      features: [],
      mvpCards: [],
      capabilityCards: [],
    })
    expect(empty.markdown).toContain('No MSD features match the current filters')
    expect(empty.markdown).not.toContain('## **1.')
  })
})

describe('describeFilters', () => {
  it('is empty when nothing is narrowing', () => {
    expect(describeFilters(EMPTY_FILTERS, model.releases, model.phases)).toBe('')
  })

  it('reads values in words, not ids', () => {
    expect(
      describeFilters(
        { ...EMPTY_FILTERS, phase: ['manage-vacancies'], mvp: [938] },
        model.releases,
        model.phases,
      ),
      // The rail says "MVP feature"; the document says MSD feature
      // everywhere else, so it says it here too.
    ).toBe('Phase: Manage Vacancies · MSD feature: SVD-938')
  })

  it('falls back to the raw value when a label is missing', () => {
    expect(
      describeFilters({ ...EMPTY_FILTERS, release: ['9.9'] }, model.releases, model.phases),
    ).toBe('Release: 9.9')
  })
})

/**
 * Edges the confirmed brief implies: the document is the screen in words, so
 * anything it states about itself — the span it covers, why it is empty —
 * has to be true of the list underneath it.
 */
describe('buildScopeExport — what the document claims about itself', () => {
  it('does not blame a filter that was never set when the map is simply empty', () => {
    // A fresh or fully-cleared dataset: no filters, nothing to list.
    const empty = buildScopeExport({
      view: 'mvp',
      releases: model.releases,
      phases: model.phases,
      filters: EMPTY_FILTERS,
      features: [],
      mvpCards: [],
      capabilityCards: [],
    })
    expect(empty.markdown).not.toContain('match the current filters')
    expect(empty.markdown).not.toContain('Clearing a filter will bring some back')
  })

  it('narrows the release span in actor view too, so a filtered export claims no more than it holds', () => {
    // Only release 1.1 survives the filter; the document still has to say so,
    // even though actor view heads its sections with actors rather than releases.
    const filtered = buildScopeExport({
      view: 'actor',
      releases: model.releases,
      phases: model.phases,
      filters: { ...EMPTY_FILTERS, release: ['1.1'] },
      features: model.features.filter((f) => f.releaseId === '1.1'),
      mvpCards: [],
      capabilityCards: [],
    })
    expect(filtered.markdown).toContain('Filtered by — Release: Release 1.1')
    expect(filtered.markdown).not.toContain('Including releases 1.1 – 1.4')
  })

  it('does not span a release the export skipped', () => {
    // Three releases, with the middle one filtered out. A range from the
    // first to the last reads as covering the one that is missing.
    const threeReleases = makeScopeGraph({
      releases: [
        ...graph.releases,
        {
          id: '2',
          label: 'Release 2',
          name: '',
          description: '',
          display_order: 3,
          in_mapping_source: 0,
          in_sequencing_source: 1,
          source: 'sequencing',
        },
      ],
      capabilities: graph.capabilities.map((c) =>
        c.id === 12 ? { ...c, release_id: '2' } : c,
      ),
    })
    const threeModel = buildScopeMap(threeReleases)
    const cards = buildCapabilityCards(threeReleases)
    const { markdown } = buildScopeExport({
      view: 'capability',
      releases: threeModel.releases,
      phases: threeModel.phases,
      filters: EMPTY_FILTERS,
      features: [],
      mvpCards: [],
      capabilityCards: cards,
    })

    // 1.4 holds nothing and has no section, so the header must not claim it.
    expect(markdown).not.toContain('## **2. Release 1.4**')
    expect(markdown).not.toContain('Including releases 1.1 – 2')
  })

  it('keeps a capability whose text runs to more than one line on one bullet', () => {
    // Capability text and its question are edited in a textarea, so a line
    // break is something a user can type. Split across lines, the remainder
    // stops being a list item and the emphasis around the actor breaks.
    const wrapped = makeScopeGraph({
      capabilities: graph.capabilities.map((c) =>
        c.id === 10 ? { ...c, text: 'Invite employer\nto register' } : c,
      ),
    })
    const { markdown } = buildScopeExport({
      view: 'capability',
      releases: model.releases,
      phases: model.phases,
      filters: EMPTY_FILTERS,
      features: [],
      mvpCards: [],
      capabilityCards: buildCapabilityCards(wrapped),
    })

    const orphan = markdown
      .split('\n')
      .find((line) => line.includes('to register') && !line.startsWith('* '))
    expect(orphan).toBeUndefined()
  })
})
