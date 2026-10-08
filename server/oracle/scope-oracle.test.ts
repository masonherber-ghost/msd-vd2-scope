import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ORACLE — temporary, deleted with the server (serverless phase 5).
 *
 * Proves the browser data layer is the server, ported, on the real data:
 *
 *  1. deriveScopeGraph(raw) === getScopeGraph()          (GET /api/scope)
 *  2. every planner === its Express route: same status, same message, same
 *     result body, and the same store afterwards.
 *
 * Runs against an in-memory copy of server/msd-vd2-scope.db, so it never
 * touches the real file. Skipped where that file does not exist (CI).
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const REAL_DB = path.join(here, '..', 'msd-vd2-scope.db')
const hasRealDb = fs.existsSync(REAL_DB)

// One connection for the whole file: the repositories cache prepared
// statements against it. Each case runs inside BEGIN … ROLLBACK, and
// better-sqlite3 turns the routes' own transactions into savepoints.
function inMemoryCopy(file: string): Database.Database {
  const image = new Database(file, { readonly: true, fileMustExist: true }).serialize()
  // The file is in WAL mode, which an in-memory image cannot be opened in.
  // Header bytes 18–19 are the read/write format versions: 2 = WAL, 1 = legacy.
  image[18] = 1
  image[19] = 1
  return new Database(image)
}

const db = hasRealDb ? inMemoryCopy(REAL_DB) : new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const { getScopeGraph } = await import('../repositories/scope-repository.js')
const { featuresRouter } = await import('../routes/features.js')
const { conflictsRouter } = await import('../routes/conflicts.js')
const { capabilitiesRouter, mvpFeaturesRouter, phasesRouter, releasesRouter } = await import(
  '../routes/entities.js'
)
const { errorHandler, notFoundHandler } = await import('../middleware/error-handler.js')
const { exportRawScope, exportSequences } = await import('../../admin/sqlite-export.js')
const { deriveScopeGraph, deriveConflicts } = await import('@/lib/scope-graph')
const plan = await import('@/lib/scope-plan')
const { ApiError } = await import('@/lib/api-client')
const { docId, utcNow } = await import('@/lib/scope-records')
type RawScope = import('@/lib/scope-records').RawScope
type Sequences = import('@/lib/scope-records').Sequences
type PlanContext = import('@/lib/scope-plan').PlanContext

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** Key order is not a contract — compare with every object's keys sorted. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

const TIMESTAMPS = ['created_at', 'updated_at', 'removed_at', 'resolved_at']

/**
 * The two sides stamp different clocks, so a timestamp is compared by what
 * happened to it — kept, set, cleared — rather than by value.
 */
function stampState(before: unknown, after: unknown): unknown {
  if (after === null) return null
  if (before === undefined) return 'new'
  return before === after ? 'same' : 'changed'
}

function normaliseStore(before: RawScope, after: RawScope) {
  return Object.fromEntries(
    (Object.keys(after) as (keyof RawScope)[]).map((key) => {
      const id = docId[key] as (row: unknown) => string
      const prior = new Map((before[key] as object[]).map((row) => [id(row), row]))
      const rows = (after[key] as Record<string, unknown>[])
        .map((row) => {
          const old = prior.get(id(row)) as Record<string, unknown> | undefined
          const out: Record<string, unknown> = { ...row }
          for (const ts of TIMESTAMPS) {
            if (ts in out) out[ts] = stampState(old?.[ts], out[ts])
          }
          return [id(row), out] as const
        })
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      return [key, canonical(rows)]
    }),
  )
}

/** Result bodies: id lists from an unordered SELECT are compared as sets. */
function normaliseBody(body: unknown): unknown {
  const stripped = JSON.parse(JSON.stringify(body), (key, value) =>
    TIMESTAMPS.includes(key) ? (value === null ? null : 'ts') : value,
  )
  for (const key of ['mvpFeatureIds', 'capabilityIds']) {
    if (stripped && Array.isArray(stripped[key])) {
      stripped[key] = [...stripped[key]].sort((a: number, b: number) => a - b)
    }
  }
  return canonical(stripped)
}

// ---------------------------------------------------------------------------
// The server side
// ---------------------------------------------------------------------------

const app = express()
app.use(express.json())
app.use('/api/features', featuresRouter)
app.use('/api/releases', releasesRouter)
app.use('/api/phases', phasesRouter)
app.use('/api/mvp-features', mvpFeaturesRouter)
app.use('/api/capabilities', capabilitiesRouter)
app.use('/api/conflicts', conflictsRouter)
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

beforeEach(() => db.exec('BEGIN'))
afterEach(() => db.exec('ROLLBACK'))

async function callServer(method: string, url: string, body?: unknown) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as unknown }
}

// ---------------------------------------------------------------------------
// Running one scenario on both sides
// ---------------------------------------------------------------------------

type Step = {
  name: string
  request: [method: string, url: string, body?: unknown]
  planner: (ctx: PlanContext) => { result: unknown; next: RawScope; sequences: Partial<Sequences> }
}

/**
 * Runs the steps in order on both sides, carrying each side's state forward,
 * and compares after every step.
 */
async function runScenario(steps: (raw: RawScope) => Step[]) {
  let raw = exportRawScope(db)

  for (const step of steps(raw)) {
    const before = raw
    // SQLite's UPSERT spends an AUTOINCREMENT number even when it takes the
    // UPDATE path, so re-saving an existing link moves the server's counter
    // and nothing else (the real data: counter 1610, highest link id 122).
    // The planner only spends one on a real insert. That difference is not a
    // contract — ids only need to be unique — so each step starts from the
    // server's counter, and the new ids it hands out are compared exactly.
    const sequences = exportSequences(db)
    const serverSide = await callServer(...step.request)

    let clientSide: { status: number; body: unknown }
    try {
      const out = step.planner({ raw, now: utcNow(), sequences })
      raw = out.next
      // A planner never hands out an id at or below the counter it was given.
      for (const [name, value] of Object.entries(out.sequences)) {
        expect(value, `${step.name}: ${name}`).toBeGreaterThan(sequences[name as keyof Sequences])
      }
      clientSide = { status: serverSide.status < 300 ? serverSide.status : 200, body: out.result }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      clientSide = { status: error.status, body: { error: error.message } }
    }

    expect({ step: step.name, status: clientSide.status }).toEqual({
      step: step.name,
      status: serverSide.status,
    })
    expect(normaliseBody(clientSide.body), step.name).toEqual(normaliseBody(serverSide.body))
    expect(normaliseStore(before, raw), `${step.name}: store`).toEqual(
      normaliseStore(before, exportRawScope(db)),
    )
  }
}

const step = (
  name: string,
  request: Step['request'],
  planner: Step['planner'],
): Step => ({ name, request, planner })

// ---------------------------------------------------------------------------
// 1. The derive
// ---------------------------------------------------------------------------

describe.skipIf(!hasRealDb)('oracle — deriveScopeGraph', () => {
  it('matches GET /api/scope on the real data, key order aside', () => {
    const derived = deriveScopeGraph(exportRawScope(db))
    expect(canonical(derived)).toEqual(canonical(getScopeGraph()))
  })

  it('preserves row order, which the views render in', () => {
    const derived = deriveScopeGraph(exportRawScope(db))
    const server = getScopeGraph()
    for (const key of [
      'releases',
      'phases',
      'pwcFeatures',
      'mvpFeatures',
      'capabilities',
      'featureMvpLinks',
      'featureCapabilityLinks',
    ] as const) {
      expect(JSON.stringify(derived[key].map((r) => canonical(r))), key).toBe(
        JSON.stringify(server[key].map((r) => canonical(r))),
      )
    }
  })

  it('matches GET /api/conflicts', async () => {
    const { body } = await callServer('GET', '/api/conflicts')
    expect(canonical(deriveConflicts(deriveScopeGraph(exportRawScope(db))))).toEqual(
      canonical(body),
    )
  })

  it('matches GET /api/features/next-id', async () => {
    const { body } = await callServer('GET', '/api/features/next-id')
    expect({ id: plan.nextFreeFeatureId(exportRawScope(db)) }).toEqual(body)
  })
})

// ---------------------------------------------------------------------------
// 2. Every write
// ---------------------------------------------------------------------------

/** Real ids picked from the data, so the scenarios exercise real rows. */
function pick(raw: RawScope) {
  const live = raw.featureCapabilityLinks.filter((l) => l.removed_at === null)
  const citedFeature = live[0].pwc_feature_id
  const citedCapability = live[0].capability_id
  const conflict = live.find((l) => l.release_conflict === 1 || l.phase_conflict === 1)!
  const ownedCaps = (mvpId: number) => raw.capabilities.filter((c) => c.mvp_feature_id === mvpId)
  const mvpWithCaps = raw.mvpFeatures.find((m) => ownedCaps(m.id).length >= 2)!
  const mvpWithoutCaps = raw.mvpFeatures.find(
    (m) => ownedCaps(m.id).length === 0 && !raw.featureMvpLinks.some((l) => l.mvp_feature_id === m.id),
  )
  const featureWithMvpLinks = raw.featureMvpLinks.find((l) => l.removed_at === null)!.pwc_feature_id
  const releases = [...raw.releases].sort((a, b) => a.display_order - b.display_order)
  const phases = [...raw.phases].sort((a, b) => a.display_order - b.display_order)
  const feature = raw.pwcFeatures.find((f) => f.id === citedFeature)!
  const otherRelease = releases.find((r) => r.id !== feature.release_id)!.id
  const otherPhase = phases.find((p) => p.id !== feature.phase_id)!.id
  const capability = raw.capabilities.find((c) => c.id === citedCapability)!
  const sibling = raw.capabilities.find(
    (c) => c.mvp_ref === capability.mvp_ref && c.id !== capability.id,
  )
  return {
    citedFeature,
    citedCapability,
    conflict,
    mvpWithCaps,
    mvpWithoutCaps,
    featureWithMvpLinks,
    releases,
    phases,
    otherRelease,
    otherPhase,
    capability,
    sibling,
  }
}

describe.skipIf(!hasRealDb)('oracle — every planner matches its route', () => {
  it('releases: create, duplicate, invalid, update, delete guarded and free', async () => {
    await runScenario((raw) => {
      const p = pick(raw)
      return [
        step('create', ['POST', '/api/releases', { id: '9.9', label: 'Package 9.9' }], (c) =>
          plan.planCreateRelease(c, { id: '9.9', label: 'Package 9.9' }),
        ),
        step('duplicate', ['POST', '/api/releases', { id: '9.9', label: 'Again' }], (c) =>
          plan.planCreateRelease(c, { id: '9.9', label: 'Again' }),
        ),
        step('invalid id', ['POST', '/api/releases', { id: 'nope', label: 'X' }], (c) =>
          plan.planCreateRelease(c, { id: 'nope', label: 'X' }),
        ),
        step('update', ['PATCH', '/api/releases/9.9', { name: 'Renamed' }], (c) =>
          plan.planUpdateRelease(c, '9.9', { name: 'Renamed' }),
        ),
        step('update nothing', ['PATCH', '/api/releases/9.9', {}], (c) =>
          plan.planUpdateRelease(c, '9.9', {}),
        ),
        step('update missing', ['PATCH', '/api/releases/8.8', { name: 'x' }], (c) =>
          plan.planUpdateRelease(c, '8.8', { name: 'x' }),
        ),
        step('delete in use', ['DELETE', `/api/releases/${p.releases[0].id}`], (c) =>
          plan.planDeleteRelease(c, p.releases[0].id),
        ),
        step('delete free', ['DELETE', '/api/releases/9.9'], (c) =>
          plan.planDeleteRelease(c, '9.9'),
        ),
      ]
    })
  })

  it('phases: create, update, move both ways and off the ends, delete', async () => {
    await runScenario((raw) => {
      const p = pick(raw)
      const first = p.phases[0].id
      const last = p.phases[p.phases.length - 1].id
      const middle = p.phases[2].id
      const body = { id: 'oracle-phase', name: 'Oracle phase' }
      return [
        step('create', ['POST', '/api/phases', body], (c) => plan.planCreatePhase(c, body)),
        step('duplicate', ['POST', '/api/phases', body], (c) => plan.planCreatePhase(c, body)),
        step('update', ['PATCH', '/api/phases/oracle-phase', { epic_ref: '999' }], (c) =>
          plan.planUpdatePhase(c, 'oracle-phase', { epic_ref: '999' }),
        ),
        step('move first up', ['POST', `/api/phases/${first}/move`, { direction: 'up' }], (c) =>
          plan.planMovePhase(c, first, 'up'),
        ),
        step('move middle up', ['POST', `/api/phases/${middle}/move`, { direction: 'up' }], (c) =>
          plan.planMovePhase(c, middle, 'up'),
        ),
        step('move middle down', ['POST', `/api/phases/${middle}/move`, { direction: 'down' }], (c) =>
          plan.planMovePhase(c, middle, 'down'),
        ),
        step('move last down', ['POST', `/api/phases/${last}/move`, { direction: 'down' }], (c) =>
          plan.planMovePhase(c, last, 'down'),
        ),
        step('delete in use', ['DELETE', `/api/phases/${first}`], (c) =>
          plan.planDeletePhase(c, first),
        ),
        step('delete free', ['DELETE', '/api/phases/oracle-phase'], (c) =>
          plan.planDeletePhase(c, 'oracle-phase'),
        ),
        step('delete missing', ['DELETE', '/api/phases/oracle-phase'], (c) =>
          plan.planDeletePhase(c, 'oracle-phase'),
        ),
      ]
    })
  })

  it('features: create, update, move with conflict recompute, notes, delete', async () => {
    await runScenario((raw) => {
      const p = pick(raw)
      const id = plan.nextFreeFeatureId(raw)
      const create = {
        id,
        name: 'Oracle feature',
        release_id: p.releases[0].id,
        phase_id: p.phases[0].id,
      }
      return [
        step('create', ['POST', '/api/features', create], (c) => plan.planCreateFeature(c, create)),
        step('duplicate', ['POST', '/api/features', create], (c) =>
          plan.planCreateFeature(c, create),
        ),
        step(
          'bad placement',
          ['POST', '/api/features', { ...create, id: 'F-999', release_id: '7.7' }],
          (c) => plan.planCreateFeature(c, { ...create, id: 'F-999', release_id: '7.7' }),
        ),
        step('rename', ['PATCH', `/api/features/${id}`, { name: 'Renamed' }], (c) =>
          plan.planUpdateFeature(c, id, { name: 'Renamed' }),
        ),
        step('notes only', ['PATCH', `/api/features/${p.citedFeature}`, { notes: 'A note' }], (c) =>
          plan.planUpdateFeature(c, p.citedFeature, { notes: 'A note' }),
        ),
        step(
          'move release',
          ['PATCH', `/api/features/${p.citedFeature}`, { release_id: p.otherRelease }],
          (c) => plan.planUpdateFeature(c, p.citedFeature, { release_id: p.otherRelease }),
        ),
        step(
          'move phase',
          ['PATCH', `/api/features/${p.citedFeature}`, { phase_id: p.otherPhase }],
          (c) => plan.planUpdateFeature(c, p.citedFeature, { phase_id: p.otherPhase }),
        ),
        step('question', ['PATCH', `/api/features/${id}`, { question: 'Why?' }], (c) =>
          plan.planUpdateFeature(c, id, { question: 'Why?' }),
        ),
        step('update missing', ['PATCH', '/api/features/F-998', { name: 'x' }], (c) =>
          plan.planUpdateFeature(c, 'F-998', { name: 'x' }),
        ),
        step('delete guarded', ['DELETE', `/api/features/${p.citedFeature}?cascade=false`], (c) =>
          plan.planDeleteFeature(c, p.citedFeature, false),
        ),
        step('delete cascade', ['DELETE', `/api/features/${p.citedFeature}?cascade=true`], (c) =>
          plan.planDeleteFeature(c, p.citedFeature, true),
        ),
        step('delete free', ['DELETE', `/api/features/${id}?cascade=false`], (c) =>
          plan.planDeleteFeature(c, id, false),
        ),
      ]
    })
  })

  it('feature links: replace, tombstone, revive, unknown ids', async () => {
    await runScenario((raw) => {
      const p = pick(raw)
      const f = p.featureWithMvpLinks
      const current = raw.featureMvpLinks
        .filter((l) => l.pwc_feature_id === f && l.removed_at === null)
        .map((l) => l.mvp_feature_id)
      const extraMvp = raw.mvpFeatures.find((m) => !current.includes(m.id))!.id
      const caps = raw.featureCapabilityLinks
        .filter((l) => l.pwc_feature_id === f && l.removed_at === null)
        .map((l) => l.capability_id)
      // One this feature has never cited, so the insert path (and a new id) runs.
      const extraCap = raw.capabilities.find(
        (c) =>
          !raw.featureCapabilityLinks.some(
            (l) => l.pwc_feature_id === f && l.capability_id === c.id,
          ),
      )!.id
      return [
        step('mvp add', ['PUT', `/api/features/${f}/mvp-features`, { mvpFeatureIds: [...current, extraMvp] }], (c) =>
          plan.planSetFeatureMvpLinks(c, f, [...current, extraMvp]),
        ),
        step('mvp remove all', ['PUT', `/api/features/${f}/mvp-features`, { mvpFeatureIds: [] }], (c) =>
          plan.planSetFeatureMvpLinks(c, f, []),
        ),
        step('mvp revive', ['PUT', `/api/features/${f}/mvp-features`, { mvpFeatureIds: current }], (c) =>
          plan.planSetFeatureMvpLinks(c, f, current),
        ),
        step('mvp unknown', ['PUT', `/api/features/${f}/mvp-features`, { mvpFeatureIds: [99999] }], (c) =>
          plan.planSetFeatureMvpLinks(c, f, [99999]),
        ),
        step('cap add new', ['PUT', `/api/features/${f}/capabilities`, { capabilityIds: [extraCap, ...caps] }], (c) =>
          plan.planSetFeatureCapabilityLinks(c, f, [extraCap, ...caps]),
        ),
        step('cap remove', ['PUT', `/api/features/${f}/capabilities`, { capabilityIds: [extraCap] }], (c) =>
          plan.planSetFeatureCapabilityLinks(c, f, [extraCap]),
        ),
        step('cap revive', ['PUT', `/api/features/${f}/capabilities`, { capabilityIds: caps }], (c) =>
          plan.planSetFeatureCapabilityLinks(c, f, caps),
        ),
        step('cap unknown', ['PUT', `/api/features/${f}/capabilities`, { capabilityIds: [99999] }], (c) =>
          plan.planSetFeatureCapabilityLinks(c, f, [99999]),
        ),
        step('missing feature', ['PUT', '/api/features/F-998/capabilities', { capabilityIds: [] }], (c) =>
          plan.planSetFeatureCapabilityLinks(c, 'F-998', []),
        ),
      ]
    })
  })

  it('conflicts: resolve, return to unreviewed, bad id, missing, bad state', async () => {
    await runScenario((raw) => {
      const id = pick(raw).conflict.id
      const decide = { resolution_state: 'mapping_wins', resolution_note: 'Oracle' }
      const undo = { resolution_state: 'unreviewed' }
      return [
        step('resolve', ['PATCH', `/api/conflicts/${id}`, decide], (c) =>
          plan.planResolveConflict(c, id, decide),
        ),
        step('unreview', ['PATCH', `/api/conflicts/${id}`, undo], (c) =>
          plan.planResolveConflict(c, id, undo),
        ),
        step('bad id', ['PATCH', '/api/conflicts/0', decide], (c) =>
          plan.planResolveConflict(c, 0, decide),
        ),
        step('missing', ['PATCH', '/api/conflicts/99999', decide], (c) =>
          plan.planResolveConflict(c, 99999, decide),
        ),
        step('bad state', ['PATCH', `/api/conflicts/${id}`, { resolution_state: 'nope' }], (c) =>
          plan.planResolveConflict(c, id, { resolution_state: 'nope' }),
        ),
      ]
    })
  })

  it('MVP features: create, update, placement moves with recompute, ownership, delete', async () => {
    await runScenario((raw) => {
      const p = pick(raw)
      const m = p.mvpWithCaps
      const owned = raw.capabilities.filter((c) => c.mvp_feature_id === m.id).map((c) => c.id)
      const create = { ref: 990001, scope_option: null, title: 'Oracle MVP' }
      const nextMvp = Math.max(exportSequences(db).mvp_features, 0) + 1
      const placed = { ref: 990002, scope_option: '1A', title: 'Placed', release_id: p.releases[0].id, phase_id: p.phases[0].id }
      return [
        step('create', ['POST', '/api/mvp-features', create], (c) => plan.planCreateMvpFeature(c, create)),
        step('duplicate', ['POST', '/api/mvp-features', create], (c) => plan.planCreateMvpFeature(c, create)),
        step('create placed', ['POST', '/api/mvp-features', placed], (c) => plan.planCreateMvpFeature(c, placed)),
        step('create bad placement', ['POST', '/api/mvp-features', { ...placed, ref: 990003, release_id: '7.7' }], (c) =>
          plan.planCreateMvpFeature(c, { ...placed, ref: 990003, release_id: '7.7' }),
        ),
        step('details only', ['PATCH', `/api/mvp-features/${m.id}`, { details: 'Some detail' }], (c) =>
          plan.planUpdateMvpFeature(c, m.id, { details: 'Some detail' }),
        ),
        step('state release', ['PATCH', `/api/mvp-features/${m.id}`, { release_id: p.otherRelease }], (c) =>
          plan.planUpdateMvpFeature(c, m.id, { release_id: p.otherRelease }),
        ),
        step('state phase', ['PATCH', `/api/mvp-features/${m.id}`, { phase_id: p.otherPhase }], (c) =>
          plan.planUpdateMvpFeature(c, m.id, { phase_id: p.otherPhase }),
        ),
        step('clear statement', ['PATCH', `/api/mvp-features/${m.id}`, { release_id: null, phase_id: '' }], (c) =>
          plan.planUpdateMvpFeature(c, m.id, { release_id: null, phase_id: '' }),
        ),
        step('option clash', ['PATCH', `/api/mvp-features/${nextMvp}`, { scope_option: null }], (c) =>
          plan.planUpdateMvpFeature(c, nextMvp, { scope_option: null }),
        ),
        step('bad id', ['PATCH', '/api/mvp-features/0', { title: 'x' }], (c) =>
          plan.planUpdateMvpFeature(c, 0, { title: 'x' }),
        ),
        step('placement', ['PUT', `/api/mvp-features/${m.id}/placement`, { release_id: p.releases[0].id, phase_id: p.phases[0].id }], (c) =>
          plan.planSetMvpPlacement(c, m.id, { release_id: p.releases[0].id, phase_id: p.phases[0].id }),
        ),
        step('placement again (no-op)', ['PUT', `/api/mvp-features/${m.id}/placement`, { release_id: p.releases[0].id }], (c) =>
          plan.planSetMvpPlacement(c, m.id, { release_id: p.releases[0].id }),
        ),
        step('placement owns nothing', ['PUT', `/api/mvp-features/${nextMvp}/placement`, { release_id: p.releases[0].id }], (c) =>
          plan.planSetMvpPlacement(c, nextMvp, { release_id: p.releases[0].id }),
        ),
        step('placement empty', ['PUT', `/api/mvp-features/${m.id}/placement`, {}], (c) =>
          plan.planSetMvpPlacement(c, m.id, {}),
        ),
        step('ownership shrink', ['PUT', `/api/mvp-features/${m.id}/capabilities`, { capabilityIds: owned.slice(1) }], (c) =>
          plan.planSetMvpCapabilities(c, m.id, owned.slice(1)),
        ),
        step('ownership give to new', ['PUT', `/api/mvp-features/${nextMvp}/capabilities`, { capabilityIds: [owned[0]] }], (c) =>
          plan.planSetMvpCapabilities(c, nextMvp, [owned[0]]),
        ),
        step('ownership unknown', ['PUT', `/api/mvp-features/${m.id}/capabilities`, { capabilityIds: [99999] }], (c) =>
          plan.planSetMvpCapabilities(c, m.id, [99999]),
        ),
        step('delete in use', ['DELETE', `/api/mvp-features/${m.id}`], (c) => plan.planDeleteMvpFeature(c, m.id)),
        step('delete free', ['DELETE', `/api/mvp-features/${nextMvp + 1}`], (c) =>
          plan.planDeleteMvpFeature(c, nextMvp + 1),
        ),
        ...(p.mvpWithoutCaps
          ? [
              step('delete unused imported', ['DELETE', `/api/mvp-features/${p.mvpWithoutCaps.id}`], (c) =>
                plan.planDeleteMvpFeature(c, p.mvpWithoutCaps!.id),
              ),
            ]
          : []),
      ]
    })
  })

  it('capabilities: create, clash, rename, move with recompute, question, delete', async () => {
    await runScenario((raw) => {
      const p = pick(raw)
      const cap = p.capability
      const create = {
        mvp_ref: cap.mvp_ref,
        text: 'An oracle capability',
        actor: 'staff',
        release_id: p.releases[0].id,
        phase_id: p.phases[0].id,
      }
      const nextCap = exportSequences(db).capabilities + 1
      return [
        step('create', ['POST', '/api/capabilities', create], (c) => plan.planCreateCapability(c, create)),
        step('duplicate (case)', ['POST', '/api/capabilities', { ...create, text: create.text.toUpperCase() }], (c) =>
          plan.planCreateCapability(c, { ...create, text: create.text.toUpperCase() }),
        ),
        step('bad actor', ['POST', '/api/capabilities', { ...create, actor: 'robot' }], (c) =>
          plan.planCreateCapability(c, { ...create, actor: 'robot' }),
        ),
        step('rename clash', ['PATCH', `/api/capabilities/${nextCap}`, { text: cap.text }], (c) =>
          plan.planUpdateCapability(c, nextCap, { text: cap.text }),
        ),
        ...(p.sibling
          ? [
              step('rename onto sibling', ['PATCH', `/api/capabilities/${p.sibling.id}`, { text: cap.text.toLowerCase() }], (c) =>
                plan.planUpdateCapability(c, p.sibling!.id, { text: cap.text.toLowerCase() }),
              ),
            ]
          : []),
        step('question only', ['PATCH', `/api/capabilities/${cap.id}`, { question: 'Is this right?' }], (c) =>
          plan.planUpdateCapability(c, cap.id, { question: 'Is this right?' }),
        ),
        step('move release', ['PATCH', `/api/capabilities/${cap.id}`, { release_id: p.otherRelease }], (c) =>
          plan.planUpdateCapability(c, cap.id, { release_id: p.otherRelease }),
        ),
        step('move phase', ['PATCH', `/api/capabilities/${cap.id}`, { phase_id: p.otherPhase }], (c) =>
          plan.planUpdateCapability(c, cap.id, { phase_id: p.otherPhase }),
        ),
        step('update missing', ['PATCH', '/api/capabilities/99999', { text: 'x' }], (c) =>
          plan.planUpdateCapability(c, 99999, { text: 'x' }),
        ),
        step('delete guarded', ['DELETE', `/api/capabilities/${cap.id}?cascade=false`], (c) =>
          plan.planDeleteCapability(c, cap.id, false),
        ),
        step('delete cascade', ['DELETE', `/api/capabilities/${cap.id}?cascade=true`], (c) =>
          plan.planDeleteCapability(c, cap.id, true),
        ),
        step('delete free', ['DELETE', `/api/capabilities/${nextCap}?cascade=false`], (c) =>
          plan.planDeleteCapability(c, nextCap, false),
        ),
      ]
    })
  })
})
