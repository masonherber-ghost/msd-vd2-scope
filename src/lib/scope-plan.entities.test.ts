import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-client'
import {
  planCreateCapability,
  planCreateFeature,
  planCreateMvpFeature,
  planCreatePhase,
  planCreateRelease,
  planDeleteCapability,
  planDeleteMvpFeature,
  planDeletePhase,
  planDeleteRelease,
  planMovePhase,
  planSetMvpCapabilities,
  planSetMvpPlacement,
  planUpdateCapability,
  planUpdateFeature,
  planUpdateMvpFeature,
  planUpdatePhase,
  planUpdateRelease,
  type Plan,
  type PlanContext,
} from '@/lib/scope-plan'
import type {
  RawScope,
  Sequences,
  StoredCapability,
  StoredFeatureCapabilityLink,
  StoredMvpFeature,
  StoredPwcFeature,
} from '@/lib/scope-records'

/**
 * Ported from server/repositories/entity-crud.test.ts. The repositories are
 * gone; what they did now happens inside the planners, so each test drives the
 * planner the route used and reads the store the plan leaves behind
 * (`plan.next`), the way the original read the table back.
 *
 * Where the original asserted a SQLite mechanism — a FOREIGN KEY, UNIQUE or
 * CHECK failure — it asserts the planner's refusal instead, since that is now
 * the only thing standing between a bad write and the store.
 */

const NOW = '2026-10-08 00:00:00'

let raw: RawScope
let sequences: Sequences

const ctx = (): PlanContext => ({ raw, now: NOW, sequences })

/** Runs a planner and commits its plan, as the client does on success. */
function commit<T>(planner: (c: PlanContext) => Plan<T>): T {
  const plan = planner(ctx())
  raw = plan.next
  sequences = { ...sequences, ...plan.sequences }
  return plan.result
}

/** Runs a planner that must refuse, and checks it left the store untouched. */
function refusal(planner: (c: PlanContext) => Plan<unknown>): ApiError {
  const before = JSON.stringify(raw)
  try {
    planner(ctx())
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect(JSON.stringify(raw)).toBe(before)
    return error as ApiError
  }
  throw new Error('Expected the planner to refuse.')
}

const release = (id: string) => raw.releases.find((r) => r.id === id)
const phasesInOrder = () => [...raw.phases].sort((a, b) => a.display_order - b.display_order)
const feature = (id: string) => raw.pwcFeatures.find((f) => f.id === id)
const mvp = (ref: number, option: string | null) =>
  raw.mvpFeatures.find((m) => m.ref === ref && m.scope_option === option)
const capability = (id: number) => raw.capabilities.find((c) => c.id === id)

/** A direct write to a stored row — the original's `db.prepare('UPDATE …')`. */
function poke<T extends object>(row: T | undefined, patch: Partial<T>) {
  Object.assign(row!, patch)
}

/** What `upsertImportedPwcFeature` wrote: an imported row, notes untouched. */
const importedFeature: StoredPwcFeature = {
  id: 'F-001',
  name: 'A feature',
  foundational_build: '',
  release_id: '1.1',
  phase_id: 'manage-vacancies',
  source_phase_label: null,
  capability_note: null,
  question: null,
  notes: '',
  notes_edited: 0,
  display_order: 1,
  source: 'mapping',
  created_at: NOW,
  updated_at: NOW,
}

function seed() {
  raw = {
    releases: [],
    phases: [],
    pwcFeatures: [],
    mvpFeatures: [],
    capabilities: [],
    featureMvpLinks: [],
    featureCapabilityLinks: [],
  }
  sequences = { mvp_features: 0, capabilities: 0, pwc_feature_capabilities: 0 }
  commit((c) => planCreateRelease(c, { id: '1.1', label: 'Release 1.1', name: 'Pilot' }))
  commit((c) =>
    planCreatePhase(c, { id: 'manage-vacancies', name: 'Manage Vacancies', epic_ref: '177' }),
  )
  commit((c) =>
    planCreatePhase(c, {
      id: 'outcomes-and-support',
      name: 'Outcomes & Support',
      epic_ref: '192',
    }),
  )
  raw = { ...raw, pwcFeatures: [{ ...importedFeature }] }
}

beforeEach(seed)

const createMvp = (ref: number, scope_option: string | null, title: string) =>
  commit((c) => planCreateMvpFeature(c, { ref, scope_option, title }))

describe('releases', () => {
  it('creates one marked manual, appended to the order', () => {
    const created = commit((c) => planCreateRelease(c, { id: '2', label: 'Release 2' }))
    expect(created).toMatchObject({ id: '2', source: 'manual', display_order: 2 })
  })

  it('patches only the supplied columns', () => {
    commit((c) => planUpdateRelease(c, '1.1', { name: 'Renamed' }))
    expect(release('1.1')).toMatchObject({ name: 'Renamed', label: 'Release 1.1' })
  })

  it('patches a label without wiping the name or description', () => {
    // The same zod-default bug as the phase case below, on the Manage page's
    // label field.
    commit((c) => planUpdateRelease(c, '1.1', { name: 'Pilot', description: 'First wave' }))
    commit((c) => planUpdateRelease(c, '1.1', { label: 'Package 1.1' }))
    expect(release('1.1')).toMatchObject({
      label: 'Package 1.1',
      name: 'Pilot',
      description: 'First wave',
    })
  })

  it('counts what depends on it', () => {
    // The count only ever surfaced in the route's refusal, so it is read
    // there: one feature, and no capability named at all.
    expect(refusal((c) => planDeleteRelease(c, '1.1'))).toMatchObject({
      status: 409,
      message: 'Cannot delete package 1.1 — 1 PwC feature reference it.',
    })
  })

  it('is refused by the foreign key while a feature points at it', () => {
    // There is no foreign key any more: the planner's refusal is the only
    // guard, so the release has to survive it.
    expect(refusal((c) => planDeleteRelease(c, '1.1')).status).toBe(409)
    expect(release('1.1')).toBeDefined()
  })

  it('deletes cleanly once nothing references it', () => {
    commit((c) => planCreateRelease(c, { id: '2', label: 'Release 2' }))
    expect(commit((c) => planDeleteRelease(c, '2'))).toEqual({ deleted: 1 })
    expect(raw.releases.map((r) => r.id)).toEqual(['1.1'])
  })
})

describe('phases', () => {
  it('keeps display_order contiguous after a create', () => {
    commit((c) => planCreatePhase(c, { id: 'third', name: 'Third' }))
    expect(phasesInOrder().map((p) => p.display_order)).toEqual([1, 2, 3])
  })

  it('moves a phase down and renumbers', () => {
    const before = phasesInOrder().map((p) => p.id)
    expect(commit((c) => planMovePhase(c, before[0], 'down')).moved).toBe(true)

    const after = phasesInOrder()
    expect(after.map((p) => p.id)).toEqual([before[1], before[0]])
    expect(after.map((p) => p.display_order)).toEqual([1, 2])
  })

  it('moves a phase up again', () => {
    const before = phasesInOrder().map((p) => p.id)
    commit((c) => planMovePhase(c, before[0], 'down'))
    commit((c) => planMovePhase(c, before[0], 'up'))
    expect(phasesInOrder().map((p) => p.id)).toEqual(before)
  })

  it('reports no move at the boundary, leaving order untouched', () => {
    const before = phasesInOrder().map((p) => p.id)
    expect(commit((c) => planMovePhase(c, before[0], 'up')).moved).toBe(false)
    expect(phasesInOrder().map((p) => p.id)).toEqual(before)
  })

  it('closes a gap in display_order', () => {
    poke(
      raw.phases.find((p) => p.id === 'outcomes-and-support'),
      { display_order: 9 },
    )
    // renumberPhases is no longer exported: every move renumbers first, so a
    // move that goes nowhere is the way to close a gap on its own.
    const result = commit((c) => planMovePhase(c, 'manage-vacancies', 'up'))
    expect(result.moved).toBe(false)
    expect(phasesInOrder().map((p) => p.display_order)).toEqual([1, 2])
  })

  it('counts dependents and deletes once free', () => {
    expect(refusal((c) => planDeletePhase(c, 'manage-vacancies'))).toMatchObject({
      status: 409,
      message: 'Cannot delete phase manage-vacancies — 1 PwC feature reference it.',
    })
    expect(commit((c) => planDeletePhase(c, 'outcomes-and-support'))).toMatchObject({
      deleted: 1,
    })
  })

  // Was a real bug, on the Express server too: the update schema was the
  // create schema made partial, and in zod 4 its `.default('')`s still filled
  // in, so PATCH { name } wiped epic_ref and epic_description.
    it('patches a name without touching the epic ref', () => {
    commit((c) => planUpdatePhase(c, 'manage-vacancies', { epic_description: 'Post and edit' }))
    commit((c) => planUpdatePhase(c, 'manage-vacancies', { name: 'Vacancies' }))
    const phase = raw.phases.find((p) => p.id === 'manage-vacancies')!
    expect(phase).toMatchObject({
      name: 'Vacancies',
      epic_ref: '177',
      epic_description: 'Post and edit',
    })
  })
})

describe('feature notes', () => {
  it('starts empty and unedited', () => {
    expect(feature('F-001')).toMatchObject({ notes: '', notes_edited: 0 })
    // The imported row above is a hand-written seed, so the check that
    // carries weight is that a feature made in the app starts the same way.
    const created = commit((c) =>
      planCreateFeature(c, {
        id: 'F-002',
        name: 'Another',
        release_id: '1.1',
        phase_id: 'manage-vacancies',
      }),
    )
    expect(created).toMatchObject({ notes: '', notes_edited: 0 })
  })

  // "takes the source assumptions on import while unedited" is not ported
  // here: it exercised setImportedNotes, whose replacement is the import
  // planner in admin/import/plan-import.ts — Node-only, and outside what a
  // browser-side test may import.

  it('never overwrites an edit on re-import (R-11.4)', () => {
    // The import's guard is `notes_edited === 0`; an edit must set it, and
    // the edited text must be what is stored.
    poke(feature('F-001'), { notes: '1. one' })
    commit((c) => planUpdateFeature(c, 'F-001', { notes: '1. one\n\nA note of our own.' }))
    expect(feature('F-001')).toMatchObject({
      notes: '1. one\n\nA note of our own.',
      notes_edited: 1,
    })
  })

  it('protects the notes without freezing the other fields', () => {
    const updated = commit((c) => planUpdateFeature(c, 'F-001', { notes: 'edited' }))
    expect(updated).toMatchObject({ notes_edited: 1, source: 'mapping' })
  })

  it('still marks the row manual when another field is edited', () => {
    const updated = commit((c) => planUpdateFeature(c, 'F-001', { name: 'Renamed' }))
    expect(updated).toMatchObject({ source: 'manual', notes_edited: 0 })
  })

  it('accepts clearing the notes', () => {
    poke(feature('F-001'), { notes: '1. one' })
    expect(commit((c) => planUpdateFeature(c, 'F-001', { notes: '' }))).toMatchObject({
      notes: '',
      notes_edited: 1,
    })
  })
})

describe('mvp features', () => {
  it('accepts the same ref with a different option as a separate record', () => {
    createMvp(951, '1A', 'A')
    createMvp(951, '1B', 'B')
    createMvp(951, null, 'bare')
    expect(raw.mvpFeatures.filter((m) => m.ref === 951)).toHaveLength(3)
  })

  it('rejects a duplicate (ref, option) pair', () => {
    createMvp(951, '1A', 'A')
    expect(
      refusal((c) => planCreateMvpFeature(c, { ref: 951, scope_option: '1A', title: 'again' })),
    ).toMatchObject({ status: 409, message: 'MVP feature 951 Option 1A already exists.' })
  })

  it('rejects a second bare record for the same ref', () => {
    createMvp(951, null, 'bare')
    expect(
      refusal((c) =>
        planCreateMvpFeature(c, { ref: 951, scope_option: null, title: 'bare again' }),
      ),
    ).toMatchObject({ status: 409, message: 'MVP feature 951 (no option) already exists.' })
  })

  it('changes an option, which is how a bare record is resolved (D-3)', () => {
    const created = createMvp(938, null, 'bare')
    commit((c) => planUpdateMvpFeature(c, created.id, { scope_option: '1A' }))
    expect(mvp(938, '1A')).toBeDefined()
    expect(mvp(938, null)).toBeUndefined()
  })

  it('deletes when nothing references it', () => {
    const created = createMvp(994, null, 'x')
    expect(commit((c) => planDeleteMvpFeature(c, created.id))).toEqual({ deleted: 1 })
  })

  it('starts with no details', () => {
    expect(createMvp(995, null, 'x').details).toBe('')
  })

  it('stores the details as given, markdown and all', () => {
    const created = createMvp(996, null, 'x')
    const updated = commit((c) =>
      planUpdateMvpFeature(c, created.id, { details: '1. One.\n2. **Two.**' }),
    )
    expect(updated.details).toBe('1. One.\n2. **Two.**')
  })

  // The same contract a PwC feature's notes have: a note about the record is
  // not a correction to it, so it must not freeze the rest against re-import.
  it('leaves the record importable when only the details change', () => {
    const created = createMvp(997, null, 'x')
    poke(mvp(997, null), { source: 'mapping' } as Partial<StoredMvpFeature>)

    expect(
      commit((c) => planUpdateMvpFeature(c, created.id, { details: 'Just a note.' })).source,
    ).toBe('mapping')
  })

  it('marks the record manual when anything else changes alongside', () => {
    const created = createMvp(998, null, 'x')
    poke(mvp(998, null), { source: 'mapping' } as Partial<StoredMvpFeature>)

    expect(
      commit((c) => planUpdateMvpFeature(c, created.id, { title: 'y', details: 'A note.' }))
        .source,
    ).toBe('manual')
  })
})

/**
 * The repository took the owner as an argument; the planner infers it from the
 * ref (D-3). The seeds here need a stated owner, so it is set on the stored row
 * afterwards, as the original's insert did.
 */
function makeCapability(
  text: string,
  mvp_feature_id: number | null = null,
  phase_id = 'manage-vacancies',
): StoredCapability {
  const created = commit((c) =>
    planCreateCapability(c, {
      mvp_ref: 994,
      text,
      actor: 'staff',
      release_id: '1.1',
      phase_id,
    }),
  )
  poke(capability(created.id), { mvp_feature_id })
  return capability(created.id)!
}

describe('capabilities', () => {
  const make = (text = 'Do a thing') => makeCapability(text)

  it('creates one marked manual', () => {
    expect(make()).toMatchObject({ text: 'Do a thing', actor: 'staff', source: 'manual' })
  })

  it('rejects an unknown actor at the database level', () => {
    // No CHECK constraint now — the schema is the only gate.
    expect(
      refusal((c) =>
        planCreateCapability(c, {
          mvp_ref: 994,
          text: 'x',
          actor: 'manager',
          release_id: '1.1',
          phase_id: 'manage-vacancies',
        }),
      ),
    ).toMatchObject({ status: 422, message: expect.stringContaining('An actor must be one of') })
  })

  it('rejects a release that does not exist', () => {
    expect(
      refusal((c) =>
        planCreateCapability(c, {
          mvp_ref: 994,
          text: 'x',
          actor: 'staff',
          release_id: 'nope',
          phase_id: 'manage-vacancies',
        }),
      ),
    ).toMatchObject({ status: 422, message: 'There is no package "nope".' })
  })

  it('enforces case-insensitive identity per ref', () => {
    make('Do a thing')
    expect(refusal((c) => planCreateCapability(c, {
      mvp_ref: 994,
      text: 'DO A THING',
      actor: 'staff',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
    }))).toMatchObject({
      status: 409,
      message: 'A capability with that text already exists under ref 994.',
    })
  })

  it('patches the actor and marks it manual', () => {
    const created = make()
    poke(capability(created.id), { source: 'sequencing' })
    commit((c) => planUpdateCapability(c, created.id, { actor: 'employer' }))
    expect(capability(created.id)).toMatchObject({ actor: 'employer', source: 'manual' })
  })

  it('counts only live feature links as dependents', () => {
    const created = make()
    // A tombstoned citation is a record of a removal, not a dependent, so it
    // does not block the delete — and it goes with the capability.
    const tombstoned: StoredFeatureCapabilityLink = {
      id: 1,
      pwc_feature_id: 'F-001',
      capability_id: created.id,
      source_citations: 1,
      matched: 1,
      release_conflict: 0,
      phase_conflict: 0,
      feature_release_id: null,
      capability_release_id: null,
      feature_phase_label: null,
      capability_phase_label: null,
      phase_conflict_merged: 0,
      resolution_state: 'unreviewed',
      resolution_note: null,
      resolved_at: null,
      source: 'mapping',
      created_at: NOW,
      updated_at: NOW,
      removed_at: NOW,
    }
    raw = { ...raw, featureCapabilityLinks: [tombstoned] }

    expect(commit((c) => planDeleteCapability(c, created.id, false))).toEqual({
      deleted: 1,
      cascaded: { features: 0 },
    })
    expect(raw.featureCapabilityLinks).toEqual([])
  })

  it('deletes when nothing references it', () => {
    const created = make()
    expect(commit((c) => planDeleteCapability(c, created.id, false))).toMatchObject({
      deleted: 1,
    })
    expect(capability(created.id)).toBeUndefined()
  })
})

describe('capability ownership by MSD feature', () => {
  const owner = () => createMvp(994, null, 'Owner')
  const owned = (id: number) =>
    raw.capabilities.filter((c) => c.mvp_feature_id === id).map((c) => c.id)

  it('claims the capabilities in the set and no others', () => {
    const record = owner()
    const mine = makeCapability('Mine')
    const theirs = makeCapability('Theirs')

    commit((c) => planSetMvpCapabilities(c, record.id, [mine.id]))

    expect(owned(record.id)).toEqual([mine.id])
    expect(capability(theirs.id)?.mvp_feature_id).toBeNull()
  })

  it('leaves a dropped capability ownerless rather than deleting it', () => {
    const record = owner()
    const mine = makeCapability('Mine', record.id)

    commit((c) => planSetMvpCapabilities(c, record.id, []))

    expect(capability(mine.id)).toMatchObject({ mvp_feature_id: null })
  })

  it('keeps mvp_ref — the ref is what the document cited, not the owner', () => {
    const other = createMvp(995, null, 'Other')
    const mine = makeCapability('Mine')

    commit((c) => planSetMvpCapabilities(c, other.id, [mine.id]))

    expect(capability(mine.id)).toMatchObject({ mvp_feature_id: other.id, mvp_ref: 994 })
  })

  it('clears the rule-chosen flag, because a person has now stated the owner', () => {
    const record = owner()
    const mine = makeCapability('Mine')
    poke(capability(mine.id), { mvp_owner_ambiguous: 1 })

    commit((c) => planSetMvpCapabilities(c, record.id, [mine.id]))

    expect(capability(mine.id)).toMatchObject({ mvp_owner_ambiguous: 0, source: 'manual' })
  })

  it('takes a capability off the record that owned it', () => {
    const first = owner()
    const second = createMvp(995, null, 'Second')
    const mine = makeCapability('Mine', first.id)

    commit((c) => planSetMvpCapabilities(c, second.id, [mine.id]))

    expect(owned(first.id)).toEqual([])
    expect(owned(second.id)).toEqual([mine.id])
  })

  it('re-saving the same set leaves an imported row importable', () => {
    const record = owner()
    const mine = makeCapability('Mine', record.id)
    poke(capability(mine.id), { source: 'sequencing' })

    const plan = planSetMvpCapabilities(ctx(), record.id, [mine.id])

    // Nothing changed, so nothing is written — the row is not marked manual
    // and the next import can still refresh it.
    expect(plan.writes).toEqual([])
    expect(plan.next.capabilities.find((c) => c.id === mine.id)).toMatchObject({
      source: 'sequencing',
    })
  })
})

/**
 * moveCapabilitiesForMvpFeature is internal to the planner now; the placement
 * route is what called it, and its `capabilityIds` are the ids it moved.
 */
describe('re-assigning an MSD feature by moving what it owns', () => {
  const owner = () => createMvp(994, null, 'Owner')
  const laterRelease = () =>
    commit((c) => planCreateRelease(c, { id: '1.4', label: 'Release 1.4', name: 'Later' }))

  it('moves every capability it owns to the new release', () => {
    const record = owner()
    const first = makeCapability('First', record.id)
    const second = makeCapability('Second', record.id)
    laterRelease()

    const result = commit((c) => planSetMvpPlacement(c, record.id, { release_id: '1.4' }))

    expect(result.capabilityIds).toEqual([first.id, second.id])
    expect(capability(first.id)).toMatchObject({ release_id: '1.4' })
    expect(capability(second.id)).toMatchObject({ release_id: '1.4' })
  })

  it('leaves a straddle on the other axis alone', () => {
    const record = owner()
    const here = makeCapability('Here', record.id, 'manage-vacancies')
    const there = makeCapability('There', record.id, 'outcomes-and-support')
    laterRelease()

    commit((c) => planSetMvpPlacement(c, record.id, { release_id: '1.4' }))

    // Both moved release; neither lost its own stage.
    expect(capability(here.id)).toMatchObject({ phase_id: 'manage-vacancies' })
    expect(capability(there.id)).toMatchObject({ phase_id: 'outcomes-and-support' })
  })

  it('carries the source phase label when the stage moves', () => {
    const record = owner()
    const mine = makeCapability('Mine', record.id)

    // The label was passed in by the route; the planner reads it off the
    // phase, so it is the same value by construction.
    commit((c) => planSetMvpPlacement(c, record.id, { phase_id: 'outcomes-and-support' }))

    expect(capability(mine.id)).toMatchObject({
      phase_id: 'outcomes-and-support',
      source_phase_label: 'Outcomes & Support',
    })
  })

  it('never touches a capability another record owns', () => {
    const record = owner()
    const other = createMvp(995, null, 'Other')
    makeCapability('Mine', record.id)
    const theirs = makeCapability('Theirs', other.id)
    laterRelease()

    commit((c) => planSetMvpPlacement(c, record.id, { release_id: '1.4' }))

    expect(capability(theirs.id)).toMatchObject({ release_id: '1.1' })
  })

  it('writes nothing for a row already there, leaving it importable', () => {
    const record = owner()
    const mine = makeCapability('Mine', record.id)
    poke(capability(mine.id), { source: 'sequencing' })

    const plan = planSetMvpPlacement(ctx(), record.id, {
      release_id: '1.1',
      phase_id: 'manage-vacancies',
    })

    expect(plan.result).toMatchObject({ moved: 0, capabilityIds: [] })
    expect(plan.writes).toEqual([])
    expect(plan.next.capabilities.find((c) => c.id === mine.id)).toMatchObject({
      source: 'sequencing',
    })
  })

  it('reports nothing moved for a record that owns no capability', () => {
    // The repository answered []; the route turned that into a refusal, and
    // the route's answer is what the planner keeps.
    const record = owner()
    expect(
      refusal((c) => planSetMvpPlacement(c, record.id, { release_id: '1.1' })),
    ).toMatchObject({ status: 409, message: expect.stringContaining('owns no capability') })
  })
})
