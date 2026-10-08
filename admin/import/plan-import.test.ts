import { beforeEach, describe, expect, it } from 'vitest'
import { deriveScopeGraph } from '../../src/lib/scope-graph.js'
import { planUpdateCapability, type Plan, type PlanContext } from '../../src/lib/scope-plan.js'
import type {
  RawScope,
  SequenceName,
  Sequences,
  StoredCapability,
  StoredMvpFeature,
} from '../../src/lib/scope-records.js'
import {
  ImportDriftError,
  assumptionsToMarkdown,
  chooseMvpOwner,
  planImport,
  type ImportSummary,
} from './plan-import.js'
import type { ReconcileResult } from './reconcile.js'
import { loadScopeFromSources } from './scope-source.js'

/**
 * The SQLite importer's tests (server/services/importer.test.ts), ported onto
 * the planner. The store is a RawScope held here: each import plans against
 * it and commits `plan.next`, so a re-import reads what the last one wrote.
 * Where the original reached into the database with raw SQL to set up a
 * state, these edit the committed store directly; where it called a
 * repository, they call the matching planner.
 */

const NOW = '2026-09-11 00:00:00'

const reconciled = loadScopeFromSources()

const emptyScope = (): RawScope => ({
  releases: [],
  phases: [],
  pwcFeatures: [],
  mvpFeatures: [],
  capabilities: [],
  featureMvpLinks: [],
  featureCapabilityLinks: [],
})

let store: { raw: RawScope; sequences: Sequences }

const ctx = (): PlanContext => ({ raw: store.raw, now: NOW, sequences: store.sequences })

function commit<T>(plan: Plan<T>): T {
  store = { raw: plan.next, sequences: { ...store.sequences, ...plan.sequences } }
  return plan.result
}

const importScope = (result: ReconcileResult = reconciled): ImportSummary =>
  commit(planImport(ctx(), result))

const updateCapability = (id: number, body: unknown) => commit(planUpdateCapability(ctx(), id, body))

/** An AUTOINCREMENT id for a row inserted by hand, as SQLite would hand out. */
function nextId(name: SequenceName): number {
  store.sequences[name] += 1
  return store.sequences[name]
}

function insertCapability(row: Partial<StoredCapability> & Pick<StoredCapability, 'mvp_ref' | 'text' | 'actor' | 'source'>) {
  // The columns a raw INSERT left to their defaults — source_text included.
  store.raw.capabilities.push({
    id: nextId('capabilities'),
    mvp_feature_id: null,
    mvp_owner_ambiguous: 0,
    release_id: null,
    phase_id: null,
    source_phase_label: null,
    question: null,
    source_text: null,
    created_at: NOW,
    updated_at: NOW,
    ...row,
  })
}

function insertMvpFeature(row: Pick<StoredMvpFeature, 'ref' | 'scope_option' | 'title' | 'source'>) {
  const inserted: StoredMvpFeature = {
    id: nextId('mvp_features'),
    release_id: null,
    phase_id: null,
    question: null,
    details: '',
    created_at: NOW,
    updated_at: NOW,
    ...row,
  }
  store.raw.mvpFeatures.push(inserted)
  return inserted
}

const capabilityById = (id: number) => store.raw.capabilities.find((c) => c.id === id)!
const featureById = (id: string) => store.raw.pwcFeatures.find((f) => f.id === id)!
const byId = <T extends { id: number }>(rows: T[]) => [...rows].sort((a, b) => a.id - b.id)
const byTextId = <T extends { id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

beforeEach(() => {
  store = {
    raw: emptyScope(),
    sequences: { mvp_features: 0, capabilities: 0, pwc_feature_capabilities: 0 },
  }
})

describe('chooseMvpOwner (D-3)', () => {
  const record = (scopeOption: '1A' | '1B' | null) => ({
    ref: 938,
    scopeOption,
    title: 't',
    source: 'mapping' as const,
  })

  it('is unambiguous when the ref has one record', () => {
    expect(chooseMvpOwner([record('1A')])).toEqual({
      owner: record('1A'),
      ambiguous: false,
    })
  })

  it('prefers the option-agnostic bare record, and flags the choice', () => {
    const result = chooseMvpOwner([record('1A'), record(null)])
    expect(result.owner?.scopeOption).toBeNull()
    expect(result.ambiguous).toBe(true)
  })

  it('falls back to the lowest option when there is no bare record', () => {
    const result = chooseMvpOwner([record('1B'), record('1A')])
    expect(result.owner?.scopeOption).toBe('1A')
    expect(result.ambiguous).toBe(true)
  })

  it('returns no owner for a ref with no records', () => {
    expect(chooseMvpOwner([])).toEqual({ owner: null, ambiguous: false })
  })
})

describe('importScope writes the whole graph', () => {
  it('reports the reconciled counts', () => {
    const summary = importScope()
    expect(summary).toMatchObject({
      // 5, not 6: OV-003 merges 1.9 into 1.4.
      releases: 5,
      phases: 7,
      pwcFeatures: 49,
      assumptions: 92,
      // 49, not 51: OV-007/OV-008 merge each bare record onto its Option 1A.
      mvpFeatures: 49,
      capabilities: 107,
      featureMvpLinks: 60,
      // OV-004…OV-006 enact the approved Release 1.1 list. Moving an MSD
      // feature out of the pilot leaves the PwC features that deliver it
      // behind, and every link between them now says so.
      releaseConflicts: 42,
      phaseConflicts: 7,
      unmatchedLinks: 2,
    })
  })

  it('collapses the duplicate citation into one edge, keeping the total', () => {
    const summary = importScope()
    // F-079 cites both casings of ref 980: one edge, two citations.
    expect(summary.featureCapabilityEdges).toBe(122)
    expect(summary.featureCapabilityCitations).toBe(123)
    expect(summary.collapsedDuplicateCitations).toBe(1)

    const doubled = store.raw.featureCapabilityLinks
      .filter((l) => l.source_citations > 1)
      .map(({ pwc_feature_id, source_citations }) => ({ pwc_feature_id, source_citations }))
    expect(doubled).toEqual([{ pwc_feature_id: 'F-079', source_citations: 2 }])
  })

  it('flags the capabilities whose MVP owner was chosen by rule', () => {
    const summary = importScope()
    // 3, not 10: the option merges leave 938 and 946 with a single record
    // each, so no rule has to choose. Only 951, which genuinely has both an
    // Option A and an Option B, is still ambiguous (D-3).
    expect(summary.ambiguousMvpOwners).toBe(3)

    const flagged = [
      ...new Set(
        store.raw.capabilities.filter((c) => c.mvp_owner_ambiguous === 1).map((c) => c.mvp_ref),
      ),
    ].sort((a, b) => a - b)
    expect(flagged).toEqual([951])
  })

  it('records both placements of a release conflict, discarding neither', () => {
    importScope()
    const link = store.raw.featureCapabilityLinks.find(
      (l) =>
        l.pwc_feature_id === 'F-014' &&
        l.release_conflict === 1 &&
        capabilityById(l.capability_id).mvp_ref === 951,
    )!

    expect(link.feature_release_id).toBe('1.1')
    expect(link.capability_release_id).toBe('1.4')
    // Neither source was overwritten.
    expect(featureById(link.pwc_feature_id).release_id).toBe('1.1')
    expect(capabilityById(link.capability_id).release_id).toBe('1.4')
  })

  it('marks the two unmatched links, leaving their capability unplaced', () => {
    importScope()
    const rows = store.raw.featureCapabilityLinks
      .filter((l) => l.matched === 0)
      .sort((a, b) => (a.pwc_feature_id < b.pwc_feature_id ? -1 : 1))
      .map((l) => {
        const c = capabilityById(l.capability_id)
        return { pwc_feature_id: l.pwc_feature_id, text: c.text, release_id: c.release_id }
      })
    expect(rows).toEqual([
      { pwc_feature_id: 'F-050', text: 'Review & publish vacancies', release_id: null },
      { pwc_feature_id: 'F-051', text: 'Review & publish vacancies', release_id: null },
    ])
  })

  it('writes both halves of the F-085 split', () => {
    importScope()
    const rows = byTextId(
      store.raw.pwcFeatures.filter((f) => f.id === 'F-085' || f.id === 'F-093'),
    ).map(({ id, name, release_id, phase_id }) => ({ id, name, release_id, phase_id }))
    expect(rows).toEqual([
      {
        id: 'F-085',
        name: 'Record vacancy outcome',
        release_id: '1.1',
        phase_id: 'manage-vacancies',
      },
      {
        id: 'F-093',
        name: 'Record applicant progression outcome',
        release_id: '1.3',
        phase_id: 'employer-recruitment',
      },
    ])
  })

  it('gives each half of the split its own assumptions', () => {
    importScope()
    const notes = byTextId(
      store.raw.pwcFeatures.filter((f) => f.id === 'F-085' || f.id === 'F-093'),
    )
    // Each half is numbered from 1 — its own list, not a slice of the original.
    expect(notes.map((row) => [row.id, row.notes.split('\n').map((l) => l.slice(0, 3))])).toEqual([
      ['F-085', ['1. ']],
      ['F-093', ['1. ', '2. ']],
    ])
  })

  it('writes no merged phase conflict, because none can arise', () => {
    importScope()
    // Both parsers store the canonical phase name, so two documents' words
    // for one phase never differ and the merged case is unreachable.
    expect(
      store.raw.featureCapabilityLinks.filter((l) => l.phase_conflict_merged === 1),
    ).toHaveLength(0)
  })

  it('leaves every phase conflict a genuine difference of phase', () => {
    importScope()
    const rows = store.raw.featureCapabilityLinks
      .filter((l) => l.phase_conflict === 1)
      .map((l) => ({
        f_phase: featureById(l.pwc_feature_id).phase_id,
        c_phase: capabilityById(l.capability_id).phase_id,
      }))
    expect(rows).toHaveLength(7)
    for (const row of rows) expect(row.f_phase).not.toBe(row.c_phase)
  })

  it('starts every conflict unreviewed (R-7.2)', () => {
    importScope()
    const states = new Set(store.raw.featureCapabilityLinks.map((l) => l.resolution_state))
    expect([...states]).toEqual(['unreviewed'])
  })
})

/**
 * The summary is derived from the reconciler, so asserting it cannot catch an
 * import that writes fewer rows than it reconciled. These compare what is
 * actually in the store against the reconciled input.
 */
describe('importScope writes exactly what it reconciled', () => {
  const rows = (collection: keyof RawScope) => store.raw[collection].length

  it('writes a row per reconciled entity', () => {
    importScope()

    expect(rows('releases')).toBe(reconciled.releases.length)
    expect(rows('phases')).toBe(reconciled.phases.length)
    expect(rows('pwcFeatures')).toBe(reconciled.features.length)
    expect(rows('mvpFeatures')).toBe(reconciled.mvpFeatures.length)
    expect(rows('capabilities')).toBe(reconciled.capabilities.length)
    expect(rows('featureMvpLinks')).toBe(reconciled.featureMvpLinks.length)
  })

  it('writes one edge per distinct pair, and citations that sum to the links', () => {
    const summary = importScope()
    expect(rows('featureCapabilityLinks')).toBe(summary.featureCapabilityEdges)

    const citations = store.raw.featureCapabilityLinks.reduce(
      (n, l) => n + l.source_citations,
      0,
    )
    expect(citations).toBe(reconciled.featureCapabilityLinks.length)
  })

  it('writes every feature\'s assumptions into its notes, numbered in order', () => {
    importScope()
    const notes = new Map(store.raw.pwcFeatures.map((row) => [row.id, row.notes]))

    const mismatched = reconciled.features
      .map((feature) => ({
        id: feature.id,
        expected: assumptionsToMarkdown(feature.assumptions),
        actual: notes.get(feature.id),
      }))
      .filter((row) => row.expected !== row.actual)

    expect(mismatched).toEqual([])
    // Nothing lost: one numbered line per source assumption.
    const lines = [...notes.values()].flatMap((n) => (n === '' ? [] : n.split('\n')))
    expect(lines).toHaveLength(reconciled.assumptions.length)
  })

  it('leaves edited notes alone on re-import (R-11.4)', () => {
    importScope()
    const id = reconciled.features.find((f) => f.assumptions.length > 0)!.id
    Object.assign(featureById(id), { notes: 'Ours.', notes_edited: 1 })

    importScope()
    expect(featureById(id).notes).toBe('Ours.')
  })

  it('writes every reconciled MVP record, keyed on ref and option', () => {
    importScope()
    const written = new Set(store.raw.mvpFeatures.map((m) => `${m.ref}|${m.scope_option ?? ''}`))
    const expected = reconciled.mvpFeatures.map((m) => `${m.ref}|${m.scopeOption ?? ''}`)

    expect(expected.filter((key) => !written.has(key))).toEqual([])
    expect(written.size).toBe(expected.length)
  })
})

describe('importScope is idempotent (R-11.4)', () => {
  it('produces identical counts when run three times', () => {
    const first = importScope()
    const second = importScope()
    const third = importScope()
    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  it('leaves the graph unchanged on re-run', () => {
    importScope()
    const before = deriveScopeGraph(store.raw).counts
    importScope()
    expect(deriveScopeGraph(store.raw).counts).toEqual(before)
  })
})

describe('importScope sweeps releases the sources no longer name', () => {
  /**
   * The case OV-003 creates: an earlier import wrote 1.9, the alias means the
   * sources stop naming it, and an upsert-only import would leave it behind
   * as an empty orphan sharing another release's display_order.
   */
  const withStale = () => {
    store.raw.releases.push({
      id: '1.9',
      label: 'Release 1.9',
      name: '',
      description: '',
      display_order: 5,
      in_mapping_source: 1,
      in_sequencing_source: 0,
      source: 'mapping',
      created_at: NOW,
      updated_at: NOW,
    })
  }

  it('drops a stale imported release', () => {
    withStale()
    const summary = importScope()
    expect(summary.removedReleases).toEqual(['1.9'])
    expect(summary.retainedStaleReleases).toEqual([])
    expect(deriveScopeGraph(store.raw).releases.map((r) => r.id)).not.toContain('1.9')
  })

  it('leaves display_order contiguous afterwards', () => {
    withStale()
    importScope()
    const orders = deriveScopeGraph(store.raw).releases.map((r) => r.display_order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('never drops a manual release the sources were never going to name', () => {
    store.raw.releases.push({
      id: '3',
      label: 'Release 3',
      name: '',
      description: '',
      display_order: 9,
      in_mapping_source: 0,
      in_sequencing_source: 0,
      source: 'manual',
      created_at: NOW,
      updated_at: NOW,
    })
    const summary = importScope()
    expect(summary.removedReleases).toEqual([])
    expect(deriveScopeGraph(store.raw).releases.map((r) => r.id)).toContain('3')
  })

  it('retains a stale release that still has rows pointing at it', () => {
    withStale()
    // A capability parked on the stale release — deleting it would either
    // break the foreign key or silently orphan the row.
    insertCapability({
      mvp_ref: 9999,
      text: 'parked on the stale release',
      actor: 'employer',
      release_id: '1.9',
      source: 'sequencing',
    })

    const summary = importScope()
    expect(summary.removedReleases).toEqual([])
    expect(summary.retainedStaleReleases).toEqual([
      { id: '1.9', features: 0, capabilities: 1 },
    ])
    expect(deriveScopeGraph(store.raw).releases.map((r) => r.id)).toContain('1.9')
  })

  it('is a no-op when there is nothing stale', () => {
    importScope()
    const summary = importScope()
    expect(summary.removedReleases).toEqual([])
    expect(summary.retainedStaleReleases).toEqual([])
  })
})

describe('importScope settles conflict flags against what it wrote', () => {
  it('leaves a manually moved feature agreeing with its capability', () => {
    importScope()
    const conflicted = byId(store.raw.featureCapabilityLinks).find(
      (l) => l.release_conflict === 1 && l.removed_at === null,
    )!
    const capabilityRelease = capabilityById(conflicted.capability_id).release_id!

    // Move the feature to meet its capability, by hand, as the UI does.
    Object.assign(featureById(conflicted.pwc_feature_id), {
      release_id: capabilityRelease,
      source: 'manual',
    })

    // Re-importing must not resurrect a conflict the move settled: the
    // sources still disagree, but the store no longer does.
    importScope()

    const after = store.raw.featureCapabilityLinks.find((l) => l.id === conflicted.id)!
    expect(after.release_conflict).toBe(0)
  })

  it('changes nothing when no row has been moved by hand', () => {
    importScope()
    const flags = () =>
      byId(store.raw.featureCapabilityLinks).map(({ id, release_conflict, phase_conflict }) => ({
        id,
        release_conflict,
        phase_conflict,
      }))
    const before = flags()
    importScope()
    expect(flags()).toEqual(before)
  })
})

describe('importScope keeps a renamed capability, rather than duplicating it', () => {
  const first = () => {
    const { id, mvp_ref, text, source_text } = byId(store.raw.capabilities)[0]
    return { id, mvp_ref, text, source_text }
  }
  const count = () => store.raw.capabilities.length

  it('records the document’s wording as source_text', () => {
    importScope()
    const row = first()
    expect(row.source_text).toBe(row.text)
  })

  it('claims the renamed row by its source text instead of inserting a second', () => {
    importScope()
    const before = count()
    const target = first()

    updateCapability(target.id, { text: 'Renamed by hand' })
    importScope()

    expect(count()).toBe(before)
    const after = capabilityById(target.id)
    // The rename stands, and the row still answers to the document's wording.
    expect(after.text).toBe('Renamed by hand')
    expect(after.source).toBe('manual')
    expect(after.source_text).toBe(target.text)
  })

  it('leaves no orphan carrying the original wording', () => {
    importScope()
    const target = first()
    updateCapability(target.id, { text: 'Renamed by hand' })
    importScope()

    const sameText = store.raw.capabilities.filter(
      (c) => c.mvp_ref === target.mvp_ref && c.text === target.text,
    )
    expect(sameText).toHaveLength(0)
  })

  it('recognises a row that predates the source_text column', () => {
    importScope()
    const target = first()
    // Rows written before migration 005 have no source_text; the lookup
    // falls back to their text, which is what it was before.
    capabilityById(target.id).source_text = null
    const before = count()

    importScope()
    expect(count()).toBe(before)
  })

  it('still matches a row that was manual before it was renamed', () => {
    // The gap migration 007 closes: a row edited by hand before source_text
    // existed had none, so a later rename left nothing matching the
    // document's wording and the import inserted a duplicate.
    importScope()
    const target = first()
    Object.assign(capabilityById(target.id), { source: 'manual', source_text: null })
    // Migration 007 backfills it before any rename can strand it.
    for (const c of store.raw.capabilities) c.source_text ??= c.text
    updateCapability(target.id, { text: 'Renamed after going manual' })

    const before = count()
    importScope()
    expect(count()).toBe(before)
  })

  it('never claims a capability created by hand', () => {
    importScope()
    const before = count()
    // No document named it, so source_text is null and no import owns it.
    insertCapability({ mvp_ref: 9999, text: 'Invented here', actor: 'staff', source: 'manual' })

    importScope()
    expect(store.raw.capabilities.filter((c) => c.text === 'Invented here')).toHaveLength(1)
    expect(count()).toBe(before + 1)
  })
})

describe('importScope leaves a question alone', () => {
  it('never clears one a person raised', () => {
    importScope()
    const target = byId(store.raw.capabilities)[0]
    updateCapability(target.id, { question: 'Is this actually in scope?' })

    importScope()

    expect(capabilityById(target.id).question).toBe('Is this actually in scope?')
  })

  it('survives a question on a row the import otherwise refreshes', () => {
    importScope()
    const target = byId(store.raw.capabilities).find((c) => c.source !== 'manual')!
    // Set it directly, so the row keeps source != 'manual' and the import
    // still refreshes its other columns.
    target.question = 'Why?'

    importScope()

    expect(capabilityById(target.id).question).toBe('Why?')
  })
})

describe('importScope sweeps MVP records the sources no longer produce', () => {
  /**
   * The case OV-007/OV-008 create: an earlier import wrote the bare 938, the
   * option merge folds it onto 938/1A, and an upsert-only import would leave
   * the bare record behind — so the split would not actually have happened.
   */
  const staleBare = () =>
    insertMvpFeature({ ref: 938, scope_option: null, title: 'Stale bare record', source: 'mapping' })

  const linkToMvp = (mvpFeatureId: number, source: string) =>
    store.raw.featureMvpLinks.push({
      pwc_feature_id: 'F-003',
      mvp_feature_id: mvpFeatureId,
      source,
      created_at: NOW,
      updated_at: NOW,
      removed_at: null,
    })

  it('drops a stale imported record', () => {
    importScope()
    staleBare()
    const summary = importScope()
    expect(summary.removedMvpFeatures).toEqual([{ ref: 938, scope_option: null }])
    expect(summary.mvpFeatures).toBe(49)
    expect(store.raw.mvpFeatures).toHaveLength(49)
  })

  it('takes its stale imported links with it, rather than being blocked by them', () => {
    importScope()
    const { id } = staleBare()
    // The link an earlier import wrote to the bare record. It is exactly the
    // row the merge replaced, so it must not keep the record alive.
    linkToMvp(id, 'mapping')

    const summary = importScope()
    expect(summary.removedMvpFeatures).toEqual([{ ref: 938, scope_option: null }])
    expect(store.raw.featureMvpLinks.filter((l) => l.mvp_feature_id === id)).toHaveLength(0)
  })

  it('keeps a stale record a manual link still points at', () => {
    importScope()
    const { id } = staleBare()
    linkToMvp(id, 'manual')

    const summary = importScope()
    expect(summary.removedMvpFeatures).toEqual([])
    expect(summary.retainedStaleMvpFeatures).toEqual([
      { ref: 938, scope_option: null, dependents: 1 },
    ])
  })

  it('keeps a stale record a capability still points at', () => {
    importScope()
    const { id } = staleBare()
    insertCapability({
      mvp_feature_id: id,
      mvp_ref: 938,
      text: 'parked on the stale record',
      actor: 'staff',
      source: 'sequencing',
    })

    const summary = importScope()
    expect(summary.removedMvpFeatures).toEqual([])
    expect(summary.retainedStaleMvpFeatures).toEqual([
      { ref: 938, scope_option: null, dependents: 1 },
    ])
  })

  it('never drops a manual record the sources were never going to produce', () => {
    importScope()
    insertMvpFeature({ ref: 9999, scope_option: null, title: 'Hand-added', source: 'manual' })
    const summary = importScope()
    expect(summary.removedMvpFeatures).toEqual([])
    expect(store.raw.mvpFeatures.filter((m) => m.ref === 9999)).toHaveLength(1)
  })

  it('is a no-op when there is nothing stale', () => {
    importScope()
    const summary = importScope()
    expect(summary.removedMvpFeatures).toEqual([])
    expect(summary.retainedStaleMvpFeatures).toEqual([])
  })
})

describe('importScope writes the approved Release 1.1 list', () => {
  const APPROVED = [939, 940, 941, 944, 946, 947, 955, 959, 962, 968, 972, 991]

  it('places exactly the twelve approved MSD features in 1.1', () => {
    importScope()
    const refs = [
      ...new Set(store.raw.capabilities.filter((c) => c.release_id === '1.1').map((c) => c.mvp_ref)),
    ].sort((a, b) => a - b)
    expect(refs).toEqual(APPROVED)
  })

  it('keeps Option A and Option B legible as separate features', () => {
    importScope()
    const rows = store.raw.mvpFeatures
      .filter((m) => m.scope_option !== null)
      .sort((a, b) => a.ref - b.ref || (a.scope_option! < b.scope_option! ? -1 : 1))
      .map(({ ref, scope_option, title }) => ({ ref, scope_option, title }))
    expect(rows).toEqual([
      {
        ref: 938,
        scope_option: '1A',
        title: 'Staff can Create and Manage Additional Employer Portal Users (Option A)',
      },
      {
        ref: 946,
        scope_option: '1A',
        title: 'Employer Portal User Access and Permissions (Option A)',
      },
      {
        ref: 948,
        scope_option: '1B',
        title: 'Employer Verification Methods (Option B)',
      },
      {
        ref: 951,
        scope_option: '1A',
        title: 'Register for the Employer Portal - New organisation (Option A)',
      },
      {
        ref: 951,
        scope_option: '1B',
        title: 'Register for the Employer Portal - New organisation (Option B)',
      },
    ])
  })
})

describe('importScope refuses to write a drifted graph (R-11.3)', () => {
  it('throws before touching the database', () => {
    const short = {
      ...reconciled,
      features: reconciled.features.slice(0, 47),
      summary: { ...reconciled.summary, pwcFeatures: 47 },
    }

    expect(() => importScope(short)).toThrow(ImportDriftError)
    // Nothing was written — the check runs first.
    expect(store.raw.pwcFeatures).toHaveLength(0)
  })

  it('names every drifted metric', () => {
    const short = {
      ...reconciled,
      summary: { ...reconciled.summary, pwcFeatures: 47, capabilities: 106 },
    }
    try {
      importScope(short)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ImportDriftError)
      const drift = (error as InstanceType<typeof ImportDriftError>).drift
      expect(drift.map((d) => d.key).sort()).toEqual(['capabilities', 'pwcFeatures'])
    }
  })
})

/**
 * There is no transaction any more: a plan is all-or-nothing because a
 * planner that throws returns no plan, so nothing is committed, and it works
 * on a copy, so the caller's store is never half-written. That is the intent
 * the SQLite rollback test guarded, and the first test below asserts it.
 */
describe('the whole import is one transaction', () => {
  it('rolls back completely if a write fails part-way', () => {
    // The original broke a foreign key, which the store does not enforce
    // (see the next test). Break an invariant the planner does check instead:
    // a feature→MVP link naming a record that will not exist. It is reached
    // after releases, phases and capabilities have been drafted.
    const broken = {
      ...reconciled,
      featureMvpLinks: reconciled.featureMvpLinks.map((l, i) =>
        i === 0 ? { ...l, ref: 123456 } : l,
      ),
    }
    const before = ctx()

    expect(() => importScope(broken)).toThrow(/Import bug: MVP feature 123456/)
    // Releases are drafted before the links; none of it reaches the store.
    expect(store.raw).toBe(before.raw)
    expect(store.raw).toEqual(emptyScope())
  })

  // The SQLite importer was stopped here by a FOREIGN KEY constraint. The
  // store has no foreign keys, so planImport checks every reference itself
  // before returning a plan (assertReferencesResolve).
  it('refuses a feature whose phase does not exist, as the foreign key did', () => {
    const broken = {
      ...reconciled,
      features: reconciled.features.map((f, i) =>
        i === 0 ? { ...f, phaseId: 'does-not-exist' } : f,
      ),
    }

    expect(() => importScope(broken)).toThrow(/feature F-\d{3} → phase does-not-exist/)
    expect(store.raw.releases).toHaveLength(0)
    expect(store.raw.capabilities).toHaveLength(0)
  })
})
