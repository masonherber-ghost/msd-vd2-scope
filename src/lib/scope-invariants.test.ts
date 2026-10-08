import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-client'
import {
  nextFreeFeatureId,
  planCreateCapability,
  planCreateFeature,
  planCreateMvpFeature,
  planDeleteFeature,
  planDeleteMvpFeature,
  planResolveConflict,
  planSetFeatureCapabilityLinks,
  planSetFeatureMvpLinks,
  planUpdateCapability,
  planUpdateFeature,
  planUpdateMvpFeature,
  type Plan,
  type PlanContext,
} from '@/lib/scope-plan'
import { deriveScopeGraph } from '@/lib/scope-graph'
import type {
  RawScope,
  Sequences,
  StoredCapability,
  StoredFeatureCapabilityLink,
  StoredMvpFeature,
  StoredPwcFeature,
} from '@/lib/scope-records'

/**
 * The invariants the SQLite schema used to hold — uniqueness, CHECK
 * constraints, foreign keys, cascades, column defaults — ported from
 * server/repositories/scope-schema.test.ts.
 *
 * Firestore has none of those, so each one is only as real as the planner
 * that checks it. These tests pin that the planners do: a refusal is asserted
 * as the ApiError the planner throws, an effect as the store it plans
 * (`plan.next`). The re-import protections (R-9.9, R-9.10, R-11.4) live with
 * the import planner, in admin/import/plan-import.invariants.test.ts.
 */

const T0 = '2026-09-01 00:00:00'
const NOW = '2026-10-08 09:00:00'

const empty = (): RawScope => ({
  releases: [],
  phases: [],
  pwcFeatures: [],
  mvpFeatures: [],
  capabilities: [],
  featureMvpLinks: [],
  featureCapabilityLinks: [],
})

/** What the import would have written — the old test's seed, as documents. */
function seeded(): RawScope {
  const raw = empty()
  raw.releases.push({
    id: '1.1',
    label: 'Release 1.1',
    name: 'Pilot',
    description: '',
    display_order: 1,
    in_mapping_source: 1,
    in_sequencing_source: 1,
    source: 'both',
    created_at: T0,
    updated_at: T0,
  })
  raw.phases.push({
    id: 'manage-vacancies',
    name: 'Manage Vacancies',
    epic_ref: '177',
    epic_description: '',
    display_order: 3,
    source: 'mapping',
    created_at: T0,
    updated_at: T0,
  })
  raw.pwcFeatures.push(importedFeature('F-001', 1))
  return raw
}

function importedFeature(id: string, display_order: number): StoredPwcFeature {
  return {
    id,
    name: 'Invite employer',
    foundational_build: '',
    release_id: '1.1',
    phase_id: 'manage-vacancies',
    source_phase_label: 'Manage Vacancies',
    capability_note: null,
    question: null,
    notes: '',
    notes_edited: 0,
    display_order,
    source: 'mapping',
    created_at: T0,
    updated_at: T0,
  }
}

function importedMvp(id: number, ref: number, scope_option: '1A' | '1B' | null): StoredMvpFeature {
  return {
    id,
    ref,
    scope_option,
    title: `MVP ${ref}`,
    release_id: null,
    phase_id: null,
    question: null,
    details: '',
    source: 'mapping',
    created_at: T0,
    updated_at: T0,
  }
}

function importedCapability(id: number, mvp_ref: number, text: string): StoredCapability {
  return {
    id,
    mvp_feature_id: null,
    mvp_ref,
    mvp_owner_ambiguous: 0,
    text,
    actor: 'staff',
    release_id: '1.1',
    phase_id: 'manage-vacancies',
    source_phase_label: 'Manage Vacancies',
    question: null,
    source: 'sequencing',
    source_text: text,
    created_at: T0,
    updated_at: T0,
  }
}

function importedConflictLink(id: number, capability_id: number): StoredFeatureCapabilityLink {
  return {
    id,
    pwc_feature_id: 'F-001',
    capability_id,
    source_citations: 1,
    matched: 1,
    release_conflict: 1,
    phase_conflict: 0,
    feature_release_id: '1.1',
    capability_release_id: '1.4',
    feature_phase_label: null,
    capability_phase_label: null,
    phase_conflict_merged: 0,
    resolution_state: 'unreviewed',
    resolution_note: null,
    resolved_at: null,
    source: 'mapping',
    created_at: T0,
    updated_at: T0,
    removed_at: null,
  }
}

/**
 * The store between steps. Each plan's `next` and moved counters are fed
 * forward, the way the client commits one plan and plans the next on top.
 */
let raw: RawScope
let sequences: Sequences

const ctx = (): PlanContext => ({ raw, now: NOW, sequences })

function commit<T>(plan: Plan<T>): T {
  raw = plan.next
  sequences = { ...sequences, ...plan.sequences }
  return plan.result
}

/** The refusal a planner throws, so status and message are asserted together. */
function refusal(fn: () => unknown): { status: number; message: string } {
  try {
    fn()
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, message: error.message }
    throw error
  }
  throw new Error('Expected the planner to refuse, but it planned the write.')
}

beforeEach(() => {
  raw = seeded()
  sequences = { mvp_features: 0, capabilities: 0, pwc_feature_capabilities: 0 }
})

describe('MVP feature uniqueness on (ref, scope_option)', () => {
  const create = (ref: number, scope_option: '1A' | '1B' | null, title = 'T') =>
    planCreateMvpFeature(ctx(), { ref, scope_option, title })

  it('allows 1A and 1B for the same ref as separate records', () => {
    commit(create(951, '1A'))
    commit(create(951, '1B'))
    expect(raw.mvpFeatures.filter((m) => m.ref === 951)).toHaveLength(2)
  })

  it('allows a bare record alongside 1A', () => {
    commit(create(938, '1A'))
    commit(create(938, null))
    expect(raw.mvpFeatures.filter((m) => m.ref === 938)).toHaveLength(2)
  })

  /**
   * The IFNULL index existed because SQLite treats NULLs as distinct; the
   * planner compares NULL as '' for the same reason. Two bare records for one
   * ref would make every lookup by (ref, null) ambiguous.
   */
  it('rejects a SECOND bare record for the same ref', () => {
    commit(create(938, null, 'first'))
    expect(refusal(() => create(938, null, 'second'))).toEqual({
      status: 409,
      message: 'MVP feature 938 (no option) already exists.',
    })
    expect(raw.mvpFeatures.filter((m) => m.ref === 938)).toHaveLength(1)
  })

  it('rejects a duplicate (ref, 1A) pair', () => {
    commit(create(951, '1A', 'a'))
    expect(refusal(() => create(951, '1A', 'b'))).toEqual({
      status: 409,
      message: 'MVP feature 951 Option 1A already exists.',
    })
  })

  it('rejects changing an option onto a sibling that already holds it', () => {
    // The unique index guarded UPDATE as well as INSERT.
    commit(create(951, '1A'))
    const b = commit(create(951, '1B'))
    expect(refusal(() => planUpdateMvpFeature(ctx(), b.id, { scope_option: '1A' }))).toEqual({
      status: 409,
      message: 'MVP feature 951 Option 1A already exists.',
    })
  })

  it('rejects a scope_option outside 1A / 1B, on create and on update', () => {
    expect(refusal(() => planCreateMvpFeature(ctx(), { ref: 999, scope_option: '2C', title: 't' })))
      .toMatchObject({ status: 422, message: expect.stringContaining('scope_option') })

    const created = commit(create(999, null))
    expect(refusal(() => planUpdateMvpFeature(ctx(), created.id, { scope_option: '2C' })))
      .toMatchObject({ status: 422, message: expect.stringContaining('scope_option') })
  })

  it('gives each record a fresh id, never a reused one', () => {
    // AUTOINCREMENT, now a counter: a deleted id must not come back.
    const first = commit(create(940, '1A'))
    commit(planDeleteMvpFeature(ctx(), first.id))
    const second = commit(create(940, '1A'))
    expect(second.id).toBeGreaterThan(first.id)
  })
})

describe('capability identity is case-insensitive on (ref, text)', () => {
  const base = { actor: 'employer', release_id: '1.1', phase_id: 'manage-vacancies' }
  const create = (mvp_ref: number, text: string, extra: Record<string, unknown> = {}) =>
    planCreateCapability(ctx(), { ...base, mvp_ref, text, ...extra })

  it('treats two casings of the same text as one capability', () => {
    commit(create(980, 'Filter and Sort Applications'))
    expect(refusal(() => create(980, 'Filter and sort applications'))).toEqual({
      status: 409,
      message: 'A capability with that text already exists under ref 980.',
    })
    expect(raw.capabilities.filter((c) => c.mvp_ref === 980)).toHaveLength(1)
  })

  it('keeps near-duplicate text as separate capabilities', () => {
    commit(create(941, 'View authenticated landing page / dashboard'))
    commit(create(941, 'View authenticated landing page'))
    expect(raw.capabilities.filter((c) => c.mvp_ref === 941)).toHaveLength(2)
  })

  it('allows the same text under a different ref', () => {
    commit(create(980, 'Filter and Sort Applications'))
    commit(create(981, 'Filter and Sort Applications'))
    expect(raw.capabilities).toHaveLength(2)
  })

  it('matches case-insensitively on rename too', () => {
    // The old findCapability lookup was LOWER(text); a rename onto a
    // sibling's wording in any casing is the same collision.
    commit(create(980, 'Filter and Sort Applications'))
    const other = commit(create(980, 'Export applications'))
    expect(
      refusal(() =>
        planUpdateCapability(ctx(), other.id, { text: 'FILTER AND SORT APPLICATIONS' }),
      ),
    ).toEqual({
      status: 409,
      message: 'MVP feature 980 already has a capability called “Filter and Sort Applications”.',
    })
  })

  it('lets a capability change the casing of its own text', () => {
    const row = commit(create(980, 'Filter and Sort Applications'))
    commit(planUpdateCapability(ctx(), row.id, { text: 'Filter and sort applications' }))
    expect(raw.capabilities[0].text).toBe('Filter and sort applications')
  })

  it('rejects an unknown actor — a new actor is a schema change', () => {
    expect(refusal(() => create(900, 'x', { actor: 'manager' }))).toEqual({
      status: 422,
      message: 'actor: An actor must be one of employer, staff, jobseeker, system.',
    })

    const row = commit(create(900, 'x'))
    expect(refusal(() => planUpdateCapability(ctx(), row.id, { actor: 'manager' }))).toEqual({
      status: 422,
      message: 'actor: An actor must be one of employer, staff, jobseeker, system.',
    })
  })

  it('requires a placement that exists', () => {
    // Formerly a foreign key to releases and phases.
    expect(refusal(() => create(900, 'x', { release_id: 'nope' }))).toEqual({
      status: 422,
      message: 'There is no package "nope".',
    })
    expect(refusal(() => create(900, 'x', { phase_id: 'nope' }))).toEqual({
      status: 422,
      message: 'There is no phase "nope".',
    })
  })
})

describe('referential integrity (R-9.4)', () => {
  beforeEach(() => {
    raw.mvpFeatures.push(importedMvp(1, 938, '1A'))
    sequences.mvp_features = 1
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', [1]))
  })

  it('cascades join rows when their feature is deleted', () => {
    expect(raw.featureMvpLinks).toHaveLength(1)
    commit(planDeleteFeature(ctx(), 'F-001', true))
    expect(raw.featureMvpLinks).toHaveLength(0)
  })

  it('does NOT let an MVP feature be deleted while a join row references it', () => {
    expect(refusal(() => planDeleteMvpFeature(ctx(), 1))).toEqual({
      status: 409,
      message: 'Cannot delete MVP feature 938 — 1 PwC feature reference it.',
    })
  })

  it('still counts a tombstoned link as a dependent of the MVP feature', () => {
    // The SQL count did not filter removed_at; a tombstone is a record of a
    // deliberate removal, and deleting its target would lose it.
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', []))
    expect(refusal(() => planDeleteMvpFeature(ctx(), 1)).status).toBe(409)
  })

  it('refuses an MVP feature that owns capabilities', () => {
    // capabilities.mvp_feature_id was a foreign key with no cascade.
    raw.featureMvpLinks = []
    raw.capabilities.push({ ...importedCapability(1, 938, 'Owned'), mvp_feature_id: 1 })
    expect(refusal(() => planDeleteMvpFeature(ctx(), 1))).toEqual({
      status: 409,
      message: 'Cannot delete MVP feature 938 — 1 capability reference it.',
    })
  })

  it('refuses a feature whose release does not exist', () => {
    expect(
      refusal(() =>
        planCreateFeature(ctx(), {
          id: 'F-999',
          name: 'Orphan',
          release_id: 'nope',
          phase_id: 'manage-vacancies',
        }),
      ),
    ).toEqual({ status: 422, message: 'There is no package "nope".' })
  })

  it('refuses a feature whose phase does not exist', () => {
    expect(
      refusal(() =>
        planCreateFeature(ctx(), { id: 'F-999', name: 'Orphan', release_id: '1.1', phase_id: 'nope' }),
      ),
    ).toEqual({ status: 422, message: 'There is no phase "nope".' })
  })

  it('rejects a feature id that is not F-nnn', () => {
    expect(
      refusal(() =>
        planCreateFeature(ctx(), {
          id: 'FEATURE-1',
          name: 'Bad id',
          release_id: '1.1',
          phase_id: 'manage-vacancies',
        }),
      ),
    ).toEqual({ status: 422, message: 'id: Feature id must look like F-001.' })
  })

  it('counts what depends on a feature, for the delete guard', () => {
    expect(refusal(() => planDeleteFeature(ctx(), 'F-001', false))).toEqual({
      status: 409,
      message:
        'Cannot delete F-001 — 1 MVP feature link reference it. Confirm the cascade to remove them too.',
    })
  })

  it('refuses links to records that do not exist', () => {
    // The join tables' foreign keys to mvp_features and capabilities.
    expect(refusal(() => planSetFeatureMvpLinks(ctx(), 'F-001', [1, 77]))).toEqual({
      status: 422,
      message: 'No MVP feature with id 77.',
    })
    expect(refusal(() => planSetFeatureCapabilityLinks(ctx(), 'F-001', [77]))).toEqual({
      status: 422,
      message: 'No capability with id 77.',
    })
  })
})

describe('feature writes', () => {
  const base = {
    name: 'New feature',
    foundational_build: 'Something.',
    release_id: '1.1',
    phase_id: 'manage-vacancies',
    capability_note: null,
  }
  const create = (id: string) => planCreateFeature(ctx(), { id, ...base })

  it('creates a feature marked manual, with timestamps and empty notes', () => {
    const created = commit(create('F-100'))
    expect(created).toMatchObject({
      id: 'F-100',
      name: 'New feature',
      source: 'manual',
      created_at: NOW,
      updated_at: NOW,
      // The column defaults the migrations used to supply.
      notes: '',
      notes_edited: 0,
      question: null,
      source_phase_label: null,
    })
  })

  it('sorts a created feature after the existing ones', () => {
    // F-001 was seeded with display_order 1.
    expect(commit(create('F-100')).display_order).toBe(2)
  })

  it('rejects a duplicate id', () => {
    commit(create('F-100'))
    expect(refusal(() => create('F-100'))).toEqual({
      status: 409,
      message: 'Feature F-100 already exists.',
    })
  })

  it('rejects an id that is not F-nnn', () => {
    expect(refusal(() => create('FEATURE-1')).status).toBe(422)
    // The CHECK was exactly three digits — F-1000 is as wrong as F-12.
    expect(refusal(() => create('F-1000')).status).toBe(422)
    expect(refusal(() => create('F-12')).status).toBe(422)
  })

  describe('nextFreeFeatureId', () => {
    it('fills the lowest gap rather than continuing past the maximum', () => {
      // F-001 is seeded, so the first gap is F-002.
      expect(nextFreeFeatureId(raw)).toBe('F-002')

      commit(create('F-002'))
      commit(create('F-004'))
      // F-003 is now the lowest gap, even though F-004 exists.
      expect(nextFreeFeatureId(raw)).toBe('F-003')
    })

    it('pads to three digits', () => {
      expect(nextFreeFeatureId(raw)).toMatch(/^F-\d{3}$/)
    })
  })

  describe('planUpdateFeature', () => {
    it('patches only the supplied fields', () => {
      const row = commit(planUpdateFeature(ctx(), 'F-001', { name: 'Renamed' }))
      expect(row.name).toBe('Renamed')
      expect(row.release_id).toBe('1.1')
      expect(row.phase_id).toBe('manage-vacancies')
    })

    it('marks an edited imported row manual, so a re-import cannot undo it', () => {
      expect(raw.pwcFeatures[0].source).toBe('mapping')
      commit(planUpdateFeature(ctx(), 'F-001', { name: 'Renamed' }))
      expect(raw.pwcFeatures[0].source).toBe('manual')
    })

    it('protects edited notes with notes_edited, without freezing the row', () => {
      commit(planUpdateFeature(ctx(), 'F-001', { notes: '1. Edited.' }))
      expect(raw.pwcFeatures[0]).toMatchObject({ notes_edited: 1, source: 'mapping' })
    })

    it('refuses a feature that does not exist', () => {
      expect(refusal(() => planUpdateFeature(ctx(), 'F-999', { name: 'x' }))).toEqual({
        status: 404,
        message: 'There is no feature F-999.',
      })
    })

    it('refuses an empty patch and writes nothing', () => {
      // The repository treated {} as a no-op; the route already refused it,
      // and the planner is the route.
      expect(refusal(() => planUpdateFeature(ctx(), 'F-001', {}))).toEqual({
        status: 422,
        message: 'Nothing to update.',
      })
      expect(raw.pwcFeatures[0].updated_at).toBe(T0)
    })

    it('refuses to move a feature to a release that does not exist', () => {
      expect(refusal(() => planUpdateFeature(ctx(), 'F-001', { release_id: 'nope' }))).toEqual({
        status: 422,
        message: 'There is no package "nope".',
      })
    })

    it('never lets the id change — it is the row\'s identity', () => {
      // An id in the patch is stripped, not applied: the doc id would no
      // longer match the row.
      const plan = planUpdateFeature(ctx(), 'F-001', { id: 'F-777', name: 'Renamed' })
      expect(plan.next.pwcFeatures.map((f) => f.id)).toEqual(['F-001'])
    })
  })

  describe('planDeleteFeature', () => {
    it('removes the feature and reports one deletion', () => {
      expect(commit(planDeleteFeature(ctx(), 'F-001', false))).toMatchObject({ deleted: 1 })
      expect(raw.pwcFeatures).toHaveLength(0)
    })

    it('refuses a feature that does not exist', () => {
      expect(refusal(() => planDeleteFeature(ctx(), 'F-999', false))).toEqual({
        status: 404,
        message: 'There is no feature F-999.',
      })
    })

    it('cascades join rows, and nothing else', () => {
      raw.mvpFeatures.push(importedMvp(1, 938, null))
      raw.capabilities.push(importedCapability(1, 938, 'Invite employer'))
      commit(planSetFeatureMvpLinks(ctx(), 'F-001', [1]))
      commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', [1]))
      // A tombstone cascades too — it belongs to the feature.
      commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', []))

      const result = commit(planDeleteFeature(ctx(), 'F-001', true))

      expect(result.cascaded).toEqual({ mvpLinks: 1, capabilityLinks: 1 })
      expect(raw.featureMvpLinks).toHaveLength(0)
      expect(raw.featureCapabilityLinks).toHaveLength(0)
      // The MVP feature and capability survive — other features use them.
      expect(raw.mvpFeatures).toHaveLength(1)
      expect(raw.capabilities).toHaveLength(1)
    })
  })
})

describe('editing a feature\'s links', () => {
  const seedMvp = (id: number, ref: number, option: '1A' | '1B' | null) => {
    raw.mvpFeatures.push(importedMvp(id, ref, option))
    return id
  }
  const seedCapability = (id: number, ref: number, text: string) => {
    raw.capabilities.push(importedCapability(id, ref, text))
    return id
  }
  const mvpLink = (featureId: string, mvpId: number) =>
    raw.featureMvpLinks.find((l) => l.pwc_feature_id === featureId && l.mvp_feature_id === mvpId)
  const liveMvpIds = (featureId: string) =>
    raw.featureMvpLinks
      .filter((l) => l.pwc_feature_id === featureId && l.removed_at === null)
      .map((l) => l.mvp_feature_id)

  it('replaces the MVP link set with exactly what is asked for', () => {
    const a = seedMvp(1, 938, '1A')
    const b = seedMvp(2, 946, '1A')
    expect(commit(planSetFeatureMvpLinks(ctx(), 'F-001', [a, b])).mvpFeatureIds).toEqual([a, b])
    expect(commit(planSetFeatureMvpLinks(ctx(), 'F-001', [b])).mvpFeatureIds).toEqual([b])
  })

  it('replaces the capability link set', () => {
    const a = seedCapability(1, 938, 'Invite employer')
    const b = seedCapability(2, 938, 'Search and find employer')
    expect(
      commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', [a, b])).capabilityIds,
    ).toEqual([a, b])
    expect(commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', [])).capabilityIds).toEqual([])
  })

  it('keeps one row per (feature, MVP feature), however often it is set', () => {
    // The composite primary key: the doc id is built from the pair.
    const a = seedMvp(1, 938, '1A')
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', [a, a]))
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', []))
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', [a]))
    expect(raw.featureMvpLinks).toHaveLength(1)
  })

  it('keeps one row per (feature, capability), however often it is set', () => {
    // UNIQUE (pwc_feature_id, capability_id).
    const a = seedCapability(1, 938, 'Invite employer')
    commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', [a]))
    commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', []))
    commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', [a]))
    expect(raw.featureCapabilityLinks).toHaveLength(1)
  })

  it('tombstones a removal rather than deleting the row', () => {
    const a = seedMvp(1, 938, '1A')
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', [a]))
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', []))
    expect(mvpLink('F-001', a)?.removed_at).toBe(NOW)
  })

  it('revives a link the user removed and then re-added', () => {
    const a = seedMvp(1, 938, '1A')
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', [a]))
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', []))
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', [a]))

    expect(liveMvpIds('F-001')).toEqual([a])
    expect(mvpLink('F-001', a)).toMatchObject({ removed_at: null, source: 'manual' })
  })

  it('hides tombstoned links from the graph read', () => {
    const a = seedMvp(1, 938, '1A')
    const c = seedCapability(1, 938, 'Invite employer')
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', [a]))
    commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', [c]))
    expect(deriveScopeGraph(raw).featureMvpLinks).toHaveLength(1)
    expect(deriveScopeGraph(raw).featureCapabilityLinks).toHaveLength(1)

    commit(planSetFeatureMvpLinks(ctx(), 'F-001', []))
    commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', []))
    expect(deriveScopeGraph(raw).featureMvpLinks).toHaveLength(0)
    expect(deriveScopeGraph(raw).featureCapabilityLinks).toHaveLength(0)
  })

  it('does not touch another feature\'s links', () => {
    raw.pwcFeatures.push(importedFeature('F-002', 2))
    const a = seedMvp(1, 938, '1A')
    commit(planSetFeatureMvpLinks(ctx(), 'F-001', [a]))
    commit(planSetFeatureMvpLinks(ctx(), 'F-002', [a]))

    commit(planSetFeatureMvpLinks(ctx(), 'F-001', []))

    expect(liveMvpIds('F-001')).toEqual([])
    expect(liveMvpIds('F-002')).toEqual([a])
  })
})

describe('conflict resolution (R-7.2)', () => {
  beforeEach(() => {
    raw.capabilities.push(importedCapability(1, 951, 'Electronic T&Cs acceptance'))
    raw.featureCapabilityLinks.push(importedConflictLink(1, 1))
    sequences = { mvp_features: 0, capabilities: 1, pwc_feature_capabilities: 1 }
  })

  const linkRow = () => raw.featureCapabilityLinks[0]

  it('starts unreviewed with no timestamp when a link is made in the app', () => {
    // The column defaults, which the planner now spells out.
    raw.capabilities.push(importedCapability(2, 951, 'Another'))
    commit(planSetFeatureCapabilityLinks(ctx(), 'F-001', [1, 2]))
    const made = raw.featureCapabilityLinks.find((l) => l.capability_id === 2)!
    expect(made).toMatchObject({
      id: 2,
      resolution_state: 'unreviewed',
      resolution_note: null,
      resolved_at: null,
      source_citations: 1,
      matched: 1,
      release_conflict: 0,
      phase_conflict: 0,
      source: 'manual',
    })
  })

  it('records a decision, a note and when it was made', () => {
    const resolved = commit(
      planResolveConflict(ctx(), 1, {
        resolution_state: 'defect_raised',
        resolution_note: 'Raised with the programme',
      }),
    )
    expect(resolved).toMatchObject({
      resolution_state: 'defect_raised',
      resolution_note: 'Raised with the programme',
      resolved_at: NOW,
    })
  })

  it('leaves both placements untouched — a decision is not an edit (R-7.1)', () => {
    commit(planResolveConflict(ctx(), 1, { resolution_state: 'table_wins', resolution_note: null }))
    expect(linkRow()).toMatchObject({
      feature_release_id: '1.1',
      capability_release_id: '1.4',
      release_conflict: 1,
    })
  })

  it('clears the timestamp when a conflict is reopened', () => {
    commit(planResolveConflict(ctx(), 1, { resolution_state: 'mapping_wins', resolution_note: 'note' }))
    const reopened = commit(
      planResolveConflict(ctx(), 1, { resolution_state: 'unreviewed', resolution_note: null }),
    )
    expect(reopened.resolution_state).toBe('unreviewed')
    expect(reopened.resolved_at).toBeNull()
  })

  it('rejects a state outside the known set', () => {
    expect(
      refusal(() =>
        planResolveConflict(ctx(), 1, { resolution_state: 'invented', resolution_note: null }),
      ),
    ).toEqual({
      status: 422,
      message:
        'resolution_state: A resolution state must be one of unreviewed, mapping_wins, table_wins, both_correct, defect_raised.',
    })
    expect(linkRow().resolution_state).toBe('unreviewed')
  })
})

describe('a question is an annotation, not an edit', () => {
  beforeEach(() => {
    raw.capabilities.push(importedCapability(1, 938, 'Question target'))
    sequences.capabilities = 1
  })

  it('does not mark the capability manual', () => {
    const after = commit(planUpdateCapability(ctx(), 1, { question: 'Still in scope?' }))
    expect(after.question).toBe('Still in scope?')
    // Marking it manual would stop the import refreshing the row, which
    // asking a question should never do.
    expect(after.source).toBe('sequencing')
  })

  it('still marks it manual when the content changes', () => {
    expect(commit(planUpdateCapability(ctx(), 1, { text: 'Reworded by hand' })).source).toBe(
      'manual',
    )
  })

  it('marks it manual when a question accompanies a content change', () => {
    expect(
      commit(planUpdateCapability(ctx(), 1, { text: 'Reworded', question: 'Why?' })).source,
    ).toBe('manual')
  })
})
