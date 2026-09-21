import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import Database from 'better-sqlite3'
import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The HTTP contract for the two paths added with capability ownership and the
 * capability delete. Everything below the route is covered by the repository
 * tests; nothing covered the route itself — its 404, its 422, and the
 * two-step the cascade is supposed to be.
 *
 * Real `better-sqlite3` at `:memory:`, real routers, real error middleware.
 */

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const { resetSchema } = await import('../test-support/apply-migrations.js')
const { capabilitiesRouter, mvpFeaturesRouter } = await import('./entities.js')
const { errorHandler, notFoundHandler } = await import('../middleware/error-handler.js')
const { createCapability, getCapabilityById } = await import(
  '../repositories/capability-repository.js'
)
const { createMvpFeature } = await import('../repositories/mvp-feature-repository.js')
const { createRelease } = await import('../repositories/release-repository.js')
const { createPhase } = await import('../repositories/phase-repository.js')
const { upsertImportedPwcFeature } = await import(
  '../repositories/pwc-feature-repository.js'
)
const { getAllFeatureCapabilityLinks, linkCapability } = await import(
  '../repositories/feature-link-repository.js'
)
const { getAllPwcFeatures } = await import('../repositories/pwc-feature-repository.js')

const app = express()
app.use(express.json())
app.use('/api/mvp-features', mvpFeaturesRouter)
app.use('/api/capabilities', capabilitiesRouter)
app.use('/api', notFoundHandler)
app.use(errorHandler)

let server: Server
let base = ''

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  )
})

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as never }
}

/** Two MSD records and three capabilities, one of them cited by F-001. */
function seed() {
  resetSchema(db)
  createRelease({ id: '1.1', label: 'Release 1.1', name: 'Pilot', description: '' })
  createPhase({
    id: 'manage-vacancies',
    name: 'Manage Vacancies',
    epic_ref: '177',
    epic_description: '',
  })
  upsertImportedPwcFeature({
    id: 'F-001',
    name: 'A feature',
    foundational_build: '',
    release_id: '1.1',
    phase_id: 'manage-vacancies',
    source_phase_label: null,
    capability_note: null,
    display_order: 1,
  })

  const owner = createMvpFeature({ ref: 938, scope_option: null, title: 'Owner' })
  const other = createMvpFeature({ ref: 948, scope_option: '1B', title: 'Other' })
  const make = (text: string, mvp_feature_id: number | null) =>
    createCapability({
      mvp_ref: 938,
      mvp_feature_id,
      text,
      actor: 'staff',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
    })

  const owned = make('Invite employer to register', owner.id)
  const alsoOwned = make('Receive secure email invite', owner.id)
  const free = make('Electronic T&Cs acceptance', null)
  linkCapability('F-001', owned.id)

  return { owner, other, owned, alsoOwned, free }
}

let fixture: ReturnType<typeof seed>
beforeEach(() => {
  fixture = seed()
})

describe('PUT /api/mvp-features/:id/capabilities', () => {
  it('replaces the owned set and answers with what the record now owns', async () => {
    const { owner, free } = fixture
    const result = await call('PUT', `/api/mvp-features/${owner.id}/capabilities`, {
      capabilityIds: [free.id],
    })

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      mvp_feature_id: owner.id,
      capabilityIds: [free.id],
    })
  })

  it('takes a capability off the record that owned it', async () => {
    const { other, owned } = fixture
    const result = await call('PUT', `/api/mvp-features/${other.id}/capabilities`, {
      capabilityIds: [owned.id],
    })

    expect(result.status).toBe(200)
    expect(getCapabilityById(owned.id)).toMatchObject({ mvp_feature_id: other.id })
  })

  it('an empty set leaves every capability ownerless rather than deleted', async () => {
    const { owner, owned, alsoOwned } = fixture
    const result = await call('PUT', `/api/mvp-features/${owner.id}/capabilities`, {
      capabilityIds: [],
    })

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ capabilityIds: [] })
    expect(getCapabilityById(owned.id)).toMatchObject({ mvp_feature_id: null })
    expect(getCapabilityById(alsoOwned.id)).toMatchObject({ mvp_feature_id: null })
  })

  it('refuses an unknown MSD feature by name, writing nothing', async () => {
    const { owned } = fixture
    const result = await call('PUT', '/api/mvp-features/9999/capabilities', {
      capabilityIds: [owned.id],
    })

    expect(result.status).toBe(404)
    expect(result.body).toMatchObject({ error: expect.stringContaining('9999') })
    expect(getCapabilityById(owned.id)).toMatchObject({
      mvp_feature_id: fixture.owner.id,
    })
  })

  it('refuses a non-integer id before it reaches the database', async () => {
    const result = await call('PUT', '/api/mvp-features/abc/capabilities', {
      capabilityIds: [],
    })
    expect(result.status).toBe(400)
  })

  it('names a capability id that does not exist and changes nothing', async () => {
    const { owner, owned } = fixture
    const result = await call('PUT', `/api/mvp-features/${owner.id}/capabilities`, {
      capabilityIds: [owned.id, 4242],
    })

    expect(result.status).toBe(422)
    expect(result.body).toMatchObject({ error: expect.stringContaining('4242') })
    // The whole set is rejected, so the record still owns both.
    expect(getCapabilityById(fixture.alsoOwned.id)).toMatchObject({
      mvp_feature_id: owner.id,
    })
  })

  it('rejects a body that is not a list of ids', async () => {
    const { owner } = fixture
    const result = await call('PUT', `/api/mvp-features/${owner.id}/capabilities`, {
      capabilityIds: 'all of them',
    })
    expect(result.status).toBe(422)
  })
})

describe('DELETE /api/capabilities/:id', () => {
  it('deletes one nothing cites without asking for a cascade', async () => {
    const { free } = fixture
    const result = await call('DELETE', `/api/capabilities/${free.id}?cascade=false`)

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ deleted: 1, cascaded: { features: 0 } })
    expect(getCapabilityById(free.id)).toBeUndefined()
  })

  it('refuses a cited capability, naming how many cite it, and keeps it', async () => {
    const { owned } = fixture
    const result = await call('DELETE', `/api/capabilities/${owned.id}?cascade=false`)

    expect(result.status).toBe(409)
    expect(result.body).toMatchObject({
      error: expect.stringContaining('1 PwC feature'),
    })
    expect(getCapabilityById(owned.id)).toBeDefined()
  })

  it('refuses it just the same when the cascade is not mentioned at all', async () => {
    const { owned } = fixture
    const result = await call('DELETE', `/api/capabilities/${owned.id}`)

    expect(result.status).toBe(409)
    expect(getCapabilityById(owned.id)).toBeDefined()
  })

  it('removes the citations with it once the cascade is confirmed, keeping the feature', async () => {
    const { owned } = fixture
    const result = await call('DELETE', `/api/capabilities/${owned.id}?cascade=true`)

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ deleted: 1, cascaded: { features: 1 } })
    expect(getCapabilityById(owned.id)).toBeUndefined()
    expect(
      getAllFeatureCapabilityLinks().filter((link) => link.capability_id === owned.id),
    ).toEqual([])
    // The feature that cited it is kept — only the citation goes.
    expect(getAllPwcFeatures().map((f) => f.id)).toContain('F-001')
  })

  it('reports an unknown capability rather than a silent no-op', async () => {
    const result = await call('DELETE', '/api/capabilities/4242?cascade=true')
    expect(result.status).toBe(404)
    expect(result.body).toMatchObject({ error: expect.stringContaining('4242') })
  })

  it('rejects a cascade value that is neither true nor false', async () => {
    const { owned } = fixture
    const result = await call('DELETE', `/api/capabilities/${owned.id}?cascade=yes`)

    expect(result.status).toBe(422)
    expect(getCapabilityById(owned.id)).toBeDefined()
  })
})

describe('PUT /api/mvp-features/:id/placement', () => {
  /** A second release and stage to move to, added per test that needs them. */
  const elsewhere = () => {
    createRelease({ id: '1.4', label: 'Release 1.4', name: 'Later', description: '' })
    createPhase({
      id: 'outcomes-and-support',
      name: 'Outcomes & Support',
      epic_ref: '192',
      epic_description: '',
    })
  }

  it('moves the capabilities the record owns, and says how many', async () => {
    const { owner, owned, alsoOwned } = fixture
    elsewhere()

    const result = await call('PUT', `/api/mvp-features/${owner.id}/placement`, {
      release_id: '1.4',
    })

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ moved: 2 })
    expect(getCapabilityById(owned.id)).toMatchObject({ release_id: '1.4' })
    expect(getCapabilityById(alsoOwned.id)).toMatchObject({ release_id: '1.4' })
  })

  it('leaves a capability the record does not own where it is', async () => {
    const { owner, free } = fixture
    elsewhere()

    await call('PUT', `/api/mvp-features/${owner.id}/placement`, { release_id: '1.4' })

    expect(getCapabilityById(free.id)).toMatchObject({ release_id: '1.1' })
  })

  it('re-judges the conflict on a feature citing what moved', async () => {
    const { owner, owned } = fixture
    elsewhere()
    // F-001 ships in 1.1 and cites this capability, which is also in 1.1 —
    // no disagreement before the move.
    const before = getAllFeatureCapabilityLinks().find((l) => l.capability_id === owned.id)
    expect(before).toMatchObject({ release_conflict: 0 })

    await call('PUT', `/api/mvp-features/${owner.id}/placement`, { release_id: '1.4' })

    const after = getAllFeatureCapabilityLinks().find((l) => l.capability_id === owned.id)
    expect(after).toMatchObject({ release_conflict: 1, capability_release_id: '1.4' })
  })

  it('moves the stage and the label that a phase conflict is measured on', async () => {
    const { owner, owned } = fixture
    elsewhere()

    await call('PUT', `/api/mvp-features/${owner.id}/placement`, {
      phase_id: 'outcomes-and-support',
    })

    expect(getCapabilityById(owned.id)).toMatchObject({
      phase_id: 'outcomes-and-support',
      source_phase_label: 'Outcomes & Support',
    })
  })

  it('refuses a record with nothing to move, and says what places it', async () => {
    const { other } = fixture
    elsewhere()

    const result = await call('PUT', `/api/mvp-features/${other.id}/placement`, {
      release_id: '1.4',
    })

    expect(result.status).toBe(409)
    expect(result.body).toMatchObject({
      error: expect.stringContaining('owns no capability'),
    })
  })

  it('refuses a release that does not exist, moving nothing', async () => {
    const { owner, owned } = fixture

    const result = await call('PUT', `/api/mvp-features/${owner.id}/placement`, {
      release_id: '9.9',
    })

    expect(result.status).toBe(422)
    expect(getCapabilityById(owned.id)).toMatchObject({ release_id: '1.1' })
  })

  it('refuses a body naming neither axis', async () => {
    const { owner } = fixture
    const result = await call('PUT', `/api/mvp-features/${owner.id}/placement`, {})
    expect(result.status).toBe(422)
  })

  it('reports an unknown MSD record rather than a silent no-op', async () => {
    const result = await call('PUT', '/api/mvp-features/4242/placement', {
      release_id: '1.1',
    })
    expect(result.status).toBe(404)
    expect(result.body).toMatchObject({ error: expect.stringContaining('4242') })
  })
})
