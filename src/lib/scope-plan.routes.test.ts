import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-client'
import {
  planCreateCapability,
  planCreateMvpFeature,
  planCreatePhase,
  planCreateRelease,
  planDeleteCapability,
  planSetFeatureCapabilityLinks,
  planSetMvpCapabilities,
  planSetMvpPlacement,
  planUpdateMvpFeature,
  type Plan,
  type PlanContext,
} from '@/lib/scope-plan'
import type {
  RawScope,
  Sequences,
  StoredCapability,
  StoredMvpFeature,
  StoredPwcFeature,
} from '@/lib/scope-records'

/**
 * Ported from server/routes/entity-routes.test.ts: the contract the MVP
 * feature and capability routes had — their 404, 422 and 409, and the
 * two-step the cascade is supposed to be.
 *
 * The routes are planners now. A refusal is the `ApiError` the route answered
 * with (status and message), and it commits nothing. A success's status no
 * longer exists; what it answered with is `plan.result`, and what it wrote is
 * `plan.next`.
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

const capability = (id: number) => raw.capabilities.find((c) => c.id === id)
const linkFor = (capabilityId: number) =>
  raw.featureCapabilityLinks.find((l) => l.capability_id === capabilityId)

const addRelease = (id: string, name = '') =>
  commit((c) => planCreateRelease(c, { id, label: `Release ${id}`, name }))
const addOutcomesPhase = () =>
  commit((c) =>
    planCreatePhase(c, {
      id: 'outcomes-and-support',
      name: 'Outcomes & Support',
      epic_ref: '192',
    }),
  )

/** Two MSD records and three capabilities, one of them cited by F-001. */
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

  addRelease('1.1', 'Pilot')
  commit((c) =>
    planCreatePhase(c, { id: 'manage-vacancies', name: 'Manage Vacancies', epic_ref: '177' }),
  )
  // An imported feature, as upsertImportedPwcFeature wrote it.
  const feature: StoredPwcFeature = {
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
  raw = { ...raw, pwcFeatures: [feature] }

  const owner = commit((c) =>
    planCreateMvpFeature(c, { ref: 938, scope_option: null, title: 'Owner' }),
  )
  const other = commit((c) =>
    planCreateMvpFeature(c, { ref: 948, scope_option: '1B', title: 'Other' }),
  )

  // The repository took the owner as given; the planner infers it from the
  // ref, which here would make `free` owned too. Set it as the seed stated.
  const make = (text: string, mvp_feature_id: number | null): StoredCapability => {
    const { id } = commit((c) =>
      planCreateCapability(c, {
        mvp_ref: 938,
        text,
        actor: 'staff',
        release_id: '1.1',
        phase_id: 'manage-vacancies',
      }),
    )
    Object.assign(capability(id)!, { mvp_feature_id })
    return { ...capability(id)! }
  }

  const owned = make('Invite employer to register', owner.id)
  const alsoOwned = make('Receive secure email invite', owner.id)
  const free = make('Electronic T&Cs acceptance', null)
  commit((c) => planSetFeatureCapabilityLinks(c, 'F-001', [owned.id]))

  return { owner, other, owned, alsoOwned, free }
}

let fixture: ReturnType<typeof seed>
beforeEach(() => {
  fixture = seed()
})

describe('PUT /api/mvp-features/:id/capabilities', () => {
  it('replaces the owned set and answers with what the record now owns', () => {
    const { owner, free } = fixture
    const result = commit((c) => planSetMvpCapabilities(c, owner.id, [free.id]))

    expect(result).toEqual({ mvp_feature_id: owner.id, capabilityIds: [free.id] })
  })

  it('takes a capability off the record that owned it', () => {
    const { other, owned } = fixture
    commit((c) => planSetMvpCapabilities(c, other.id, [owned.id]))

    expect(capability(owned.id)).toMatchObject({ mvp_feature_id: other.id })
  })

  it('an empty set leaves every capability ownerless rather than deleted', () => {
    const { owner, owned, alsoOwned } = fixture
    const result = commit((c) => planSetMvpCapabilities(c, owner.id, []))

    expect(result).toMatchObject({ capabilityIds: [] })
    expect(capability(owned.id)).toMatchObject({ mvp_feature_id: null })
    expect(capability(alsoOwned.id)).toMatchObject({ mvp_feature_id: null })
  })

  it('refuses an unknown MSD feature by name, writing nothing', () => {
    const { owned } = fixture
    const error = refusal((c) => planSetMvpCapabilities(c, 9999, [owned.id]))

    expect(error.status).toBe(404)
    expect(error.message).toContain('9999')
    expect(capability(owned.id)).toMatchObject({ mvp_feature_id: fixture.owner.id })
  })

  it('refuses a non-integer id before it reaches the database', () => {
    // The route parsed `abc` from the path to NaN; the planner is handed the
    // same NaN by a caller that parsed badly.
    expect(refusal((c) => planSetMvpCapabilities(c, Number('abc'), [])).status).toBe(400)
  })

  it('names a capability id that does not exist and changes nothing', () => {
    const { owner, owned } = fixture
    const error = refusal((c) => planSetMvpCapabilities(c, owner.id, [owned.id, 4242]))

    expect(error.status).toBe(422)
    expect(error.message).toContain('4242')
    // The whole set is rejected, so the record still owns both.
    expect(capability(fixture.alsoOwned.id)).toMatchObject({ mvp_feature_id: owner.id })
  })

  it('rejects a body that is not a list of ids', () => {
    const { owner } = fixture
    const notAList = 'all of them' as unknown as number[]
    expect(refusal((c) => planSetMvpCapabilities(c, owner.id, notAList)).status).toBe(422)
  })
})

describe('DELETE /api/capabilities/:id', () => {
  it('deletes one nothing cites without asking for a cascade', () => {
    const { free } = fixture
    const result = commit((c) => planDeleteCapability(c, free.id, false))

    expect(result).toMatchObject({ deleted: 1, cascaded: { features: 0 } })
    expect(capability(free.id)).toBeUndefined()
  })

  it('refuses a cited capability, naming how many cite it, and keeps it', () => {
    const { owned } = fixture
    const error = refusal((c) => planDeleteCapability(c, owned.id, false))

    expect(error.status).toBe(409)
    expect(error.message).toContain('1 PwC feature')
    expect(capability(owned.id)).toBeDefined()
  })

  it('refuses it just the same when the cascade is not mentioned at all', () => {
    // There is no query string to leave out. The client defaults `cascade` to
    // false; a caller that passes nothing gets the same refusal.
    const { owned } = fixture
    const unstated = undefined as unknown as boolean
    expect(refusal((c) => planDeleteCapability(c, owned.id, unstated)).status).toBe(409)
    expect(capability(owned.id)).toBeDefined()
  })

  it('removes the citations with it once the cascade is confirmed, keeping the feature', () => {
    const { owned } = fixture
    const result = commit((c) => planDeleteCapability(c, owned.id, true))

    expect(result).toMatchObject({ deleted: 1, cascaded: { features: 1 } })
    expect(capability(owned.id)).toBeUndefined()
    expect(raw.featureCapabilityLinks.filter((l) => l.capability_id === owned.id)).toEqual([])
    // The feature that cited it is kept — only the citation goes.
    expect(raw.pwcFeatures.map((f) => f.id)).toContain('F-001')
  })

  it('reports an unknown capability rather than a silent no-op', () => {
    const error = refusal((c) => planDeleteCapability(c, 4242, true))
    expect(error.status).toBe(404)
    expect(error.message).toContain('4242')
  })

  it('rejects a cascade value that is neither true nor false', () => {
    // The route parsed `?cascade=yes` and refused it. There is no string to
    // parse now: `cascade` is a boolean in the planner's type, so the check
    // moved to the compiler — `tsc -b` fails if this ever stops being an
    // error. The arrow is never called; at runtime a truthy string would be
    // read as a confirmed cascade.
    const { owned } = fixture
    // @ts-expect-error a string is not a cascade
    const yes = (c: PlanContext) => planDeleteCapability(c, owned.id, 'yes')
    expect(yes).toBeTypeOf('function')
    expect(capability(owned.id)).toBeDefined()
  })
})

describe('PUT /api/mvp-features/:id/placement', () => {
  /** A second release and stage to move to, added per test that needs them. */
  const elsewhere = () => {
    addRelease('1.4', 'Later')
    addOutcomesPhase()
  }

  it('moves the capabilities the record owns, and says how many', () => {
    const { owner, owned, alsoOwned } = fixture
    elsewhere()

    const result = commit((c) => planSetMvpPlacement(c, owner.id, { release_id: '1.4' }))

    expect(result).toMatchObject({ moved: 2 })
    expect(capability(owned.id)).toMatchObject({ release_id: '1.4' })
    expect(capability(alsoOwned.id)).toMatchObject({ release_id: '1.4' })
  })

  it('leaves a capability the record does not own where it is', () => {
    const { owner, free } = fixture
    elsewhere()

    commit((c) => planSetMvpPlacement(c, owner.id, { release_id: '1.4' }))

    expect(capability(free.id)).toMatchObject({ release_id: '1.1' })
  })

  it('re-judges the conflict on a feature citing what moved', () => {
    const { owner, owned } = fixture
    elsewhere()
    // F-001 ships in 1.1 and cites this capability, which is also in 1.1 —
    // no disagreement before the move.
    expect(linkFor(owned.id)).toMatchObject({ release_conflict: 0 })

    commit((c) => planSetMvpPlacement(c, owner.id, { release_id: '1.4' }))

    expect(linkFor(owned.id)).toMatchObject({
      release_conflict: 1,
      capability_release_id: '1.4',
    })
  })

  it('moves the stage and the label that a phase conflict is measured on', () => {
    const { owner, owned } = fixture
    elsewhere()

    commit((c) => planSetMvpPlacement(c, owner.id, { phase_id: 'outcomes-and-support' }))

    expect(capability(owned.id)).toMatchObject({
      phase_id: 'outcomes-and-support',
      source_phase_label: 'Outcomes & Support',
    })
  })

  it('refuses a record with nothing to move, and says what places it', () => {
    const { other } = fixture
    elsewhere()

    const error = refusal((c) => planSetMvpPlacement(c, other.id, { release_id: '1.4' }))

    expect(error.status).toBe(409)
    expect(error.message).toContain('owns no capability')
  })

  it('refuses a release that does not exist, moving nothing', () => {
    const { owner, owned } = fixture

    const error = refusal((c) => planSetMvpPlacement(c, owner.id, { release_id: '9.9' }))

    expect(error.status).toBe(422)
    expect(capability(owned.id)).toMatchObject({ release_id: '1.1' })
  })

  it('refuses a body naming neither axis', () => {
    const { owner } = fixture
    expect(refusal((c) => planSetMvpPlacement(c, owner.id, {})).status).toBe(422)
  })

  it('reports an unknown MSD record rather than a silent no-op', () => {
    const error = refusal((c) => planSetMvpPlacement(c, 4242, { release_id: '1.1' }))
    expect(error.status).toBe(404)
    expect(error.message).toContain('4242')
  })
})

const createMvp = (body: Record<string, unknown>): StoredMvpFeature =>
  commit((c) => planCreateMvpFeature(c, { scope_option: null, ...body }))
const patchMvp = (id: number, body: Record<string, unknown>): StoredMvpFeature =>
  commit((c) => planUpdateMvpFeature(c, id, body))

/**
 * A stated placement on the record itself. It is the only thing that can
 * place a record owning no capability — the move endpoint refuses those,
 * because it works by moving capabilities and there are none.
 */
describe('stated placement on an MSD feature', () => {
  it('stores a release and stage given at creation', () => {
    const result = createMvp({
      ref: 994,
      title: 'New record',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
    })
    expect(result).toMatchObject({ release_id: '1.1', phase_id: 'manage-vacancies' })
  })

  it('leaves a record unstated when neither is given', () => {
    const result = createMvp({ ref: 995, title: 'Unstated' })
    expect(result).toMatchObject({ release_id: null, phase_id: null })
  })

  it('states a placement on an existing record', () => {
    const { owner } = fixture
    const result = patchMvp(owner.id, { release_id: '1.1', phase_id: 'manage-vacancies' })
    expect(result).toMatchObject({ release_id: '1.1', phase_id: 'manage-vacancies' })
  })

  it('clears a statement with null, handing the record back to the sources', () => {
    const { owner } = fixture
    patchMvp(owner.id, { release_id: '1.1' })
    expect(patchMvp(owner.id, { release_id: null })).toMatchObject({ release_id: null })
  })

  it('reads an empty string as unstated, which is what a blank select sends', () => {
    const { owner } = fixture
    expect(patchMvp(owner.id, { release_id: '' })).toMatchObject({ release_id: null })
  })

  it('refuses a release that does not exist', () => {
    const { owner } = fixture
    const error = refusal((c) => planUpdateMvpFeature(c, owner.id, { release_id: '9.9' }))
    expect(error.status).toBe(422)
    expect(error.message).toContain('9.9')
  })

  it('refuses a stage that does not exist', () => {
    const error = refusal((c) =>
      planCreateMvpFeature(c, {
        ref: 996,
        scope_option: null,
        title: 'Bad stage',
        phase_id: 'no-such-stage',
      }),
    )
    expect(error.status).toBe(422)
    expect(error.message).toContain('no-such-stage')
  })

  it('places a record that owns no capability, which the move endpoint cannot', () => {
    const { id } = createMvp({ ref: 997, title: 'Owns nothing' })

    // The move endpoint has nothing to move and says so.
    expect(refusal((c) => planSetMvpPlacement(c, id, { release_id: '1.1' })).status).toBe(409)

    // Stating it on the record works.
    expect(patchMvp(id, { release_id: '1.1', phase_id: 'manage-vacancies' })).toMatchObject({
      release_id: '1.1',
      phase_id: 'manage-vacancies',
    })
  })
})

/** A question raised against an MSD feature record. */
describe('a question on an MSD feature', () => {
  it('saves one against the record', () => {
    const { owner } = fixture
    expect(patchMvp(owner.id, { question: 'Is this still in 1.1?' })).toMatchObject({
      question: 'Is this still in 1.1?',
    })
  })

  it('clears it with null rather than storing a blank', () => {
    const { owner } = fixture
    patchMvp(owner.id, { question: 'Anything?' })
    expect(patchMvp(owner.id, { question: null })).toMatchObject({ question: null })
  })

  it('reaches a record that owns no capability', () => {
    // Those five records are exactly the ones a question is most likely
    // about, and they have nowhere else to hang one.
    const { id } = createMvp({ ref: 998, title: 'Owns nothing' })
    expect(patchMvp(id, { question: 'Is this a feature at all?' })).toMatchObject({
      question: 'Is this a feature at all?',
    })
  })

  it('starts life without one', () => {
    expect(createMvp({ ref: 999, title: 'Fresh' })).toMatchObject({ question: null })
  })
})

/**
 * The record's placement drives its capabilities, not the other way round.
 *
 * Before, the two could disagree: a record stated in 1.2 whose capabilities
 * sat in 1.4 showed one release on the card and another in the editor, and
 * moving the capabilities could not move the card. Setting the record now
 * moves everything it owns to match.
 */
describe('placing an MSD feature moves its capabilities', () => {
  it('moves every capability it owns to the stated release', () => {
    const { owner, owned, alsoOwned } = fixture
    addRelease('1.4')

    patchMvp(owner.id, { release_id: '1.4' })

    expect(capability(owned.id)).toMatchObject({ release_id: '1.4' })
    expect(capability(alsoOwned.id)).toMatchObject({ release_id: '1.4' })
  })

  it('carries the stage label with a stage move, so conflicts stay measurable', () => {
    const { owner, owned } = fixture
    addOutcomesPhase()

    patchMvp(owner.id, { phase_id: 'outcomes-and-support' })

    expect(capability(owned.id)).toMatchObject({
      phase_id: 'outcomes-and-support',
      source_phase_label: 'Outcomes & Support',
    })
  })

  it('leaves capabilities where they are when the statement is cleared', () => {
    // There is no placement to inherit, and the record goes back to being
    // placed by what it owns — which means leaving what it owns alone.
    const { owner, owned } = fixture
    patchMvp(owner.id, { release_id: '1.1' })
    const before = { ...capability(owned.id) }

    patchMvp(owner.id, { release_id: null })

    expect(capability(owned.id)).toMatchObject({
      release_id: before.release_id,
      phase_id: before.phase_id,
    })
  })

  it('touches no capability when only the title changes', () => {
    const { owner, owned } = fixture
    const before = { ...capability(owned.id) }

    patchMvp(owner.id, { title: 'Renamed' })

    expect(capability(owned.id)).toMatchObject({
      release_id: before.release_id,
      phase_id: before.phase_id,
    })
  })

  it('does not touch a capability the record does not own', () => {
    const { owner, free } = fixture
    addRelease('1.4')
    const before = { ...capability(free.id) }

    patchMvp(owner.id, { release_id: '1.4' })

    expect(capability(free.id)).toMatchObject({ release_id: before.release_id })
  })
})
