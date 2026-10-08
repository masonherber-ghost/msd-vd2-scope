import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ORACLE — temporary, deleted with the server (serverless phase 5).
 *
 * The Firestore re-import (admin/import/plan-import.ts) against the SQLite
 * importer it replaces, on an in-memory copy of the real database: same
 * summary, same store afterwards — after a plain re-run, after the kinds of
 * edits the app makes, and from empty.
 *
 * Rows the import creates get different ids on the two sides (SQLite's
 * UPSERT spends AUTOINCREMENT numbers on the update path), so stores are
 * compared by natural key: MVP record = ref + option, capability = ref +
 * source wording, link = feature + capability.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const REAL_DB = path.join(here, '..', 'msd-vd2-scope.db')
const hasRealDb = fs.existsSync(REAL_DB)

function inMemoryCopy(file: string): Database.Database {
  const image = new Database(file, { readonly: true, fileMustExist: true }).serialize()
  image[18] = 1 // WAL → legacy, so the image opens in memory
  image[19] = 1
  return new Database(image)
}

const db = hasRealDb ? inMemoryCopy(REAL_DB) : new Database(':memory:')
db.pragma('foreign_keys = ON')
vi.mock('../database.js', () => ({ db }))

const { importScope } = await import('../services/importer.js')
const { loadScopeFromSources } = await import('../services/scope-source.js')
const caps = await import('../repositories/capability-repository.js')
const features = await import('../repositories/pwc-feature-repository.js')
const links = await import('../repositories/feature-link-repository.js')
const releases = await import('../repositories/release-repository.js')
const mvps = await import('../repositories/mvp-feature-repository.js')
const { exportRawScope, exportSequences } = await import('../../admin/sqlite-export.js')
const { planImport } = await import('../../admin/import/plan-import.js')
const { sqlLower } = await import('@/lib/scope-plan')
const { utcNow } = await import('@/lib/scope-records')
type RawScope = import('@/lib/scope-records').RawScope

const reconciled = hasRealDb ? loadScopeFromSources() : null

beforeEach(() => db.exec('BEGIN'))
afterEach(() => db.exec('ROLLBACK'))

const TIMESTAMPS = ['created_at', 'updated_at', 'removed_at', 'resolved_at']

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

/** The store keyed by natural key, ids replaced by what they point at. */
function byNaturalKey(raw: RawScope, before: RawScope) {
  const mvpKey = new Map(raw.mvpFeatures.map((m) => [m.id, `${m.ref}|${m.scope_option ?? ''}`]))
  const capKey = new Map(
    raw.capabilities.map((c) => [c.id, `${c.mvp_ref}|${sqlLower(c.source_text ?? c.text)}`]),
  )
  const beforeMvpKey = new Map(before.mvpFeatures.map((m) => [`${m.ref}|${m.scope_option ?? ''}`, m]))
  const beforeCapKey = new Map(
    before.capabilities.map((c) => [`${c.mvp_ref}|${sqlLower(c.source_text ?? c.text)}`, c]),
  )
  const beforeById = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))

  const stamp = (row: Record<string, unknown>, prior: Record<string, unknown> | undefined) => {
    const out = { ...row }
    for (const ts of TIMESTAMPS) {
      if (!(ts in out)) continue
      out[ts] =
        out[ts] === null ? null : prior === undefined ? 'new' : prior[ts] === out[ts] ? 'same' : 'changed'
    }
    return out
  }
  const sortBy = <T>(rows: [string, T][]) => rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const capLinkKey = (l: { pwc_feature_id: string; capability_id: number }) =>
    `${l.pwc_feature_id}|${capKey.get(l.capability_id)}`
  const beforeCapLinks = new Map(
    before.featureCapabilityLinks.map((l) => {
      const c = before.capabilities.find((x) => x.id === l.capability_id)!
      return [`${l.pwc_feature_id}|${c.mvp_ref}|${sqlLower(c.source_text ?? c.text)}`, l]
    }),
  )
  const beforeMvpLinks = new Map(
    before.featureMvpLinks.map((l) => {
      const m = before.mvpFeatures.find((x) => x.id === l.mvp_feature_id)!
      return [`${l.pwc_feature_id}|${m.ref}|${m.scope_option ?? ''}`, l]
    }),
  )

  return canonical({
    releases: sortBy(raw.releases.map((r) => [r.id, stamp(r, beforeById(before.releases).get(r.id))])),
    phases: sortBy(raw.phases.map((p) => [p.id, stamp(p, beforeById(before.phases).get(p.id))])),
    pwcFeatures: sortBy(raw.pwcFeatures.map((f) => [f.id, stamp(f, beforeById(before.pwcFeatures).get(f.id))])),
    mvpFeatures: sortBy(
      raw.mvpFeatures.map(({ id, ...m }) => {
        const key = mvpKey.get(id)!
        return [key, stamp(m, beforeMvpKey.get(key))]
      }),
    ),
    capabilities: sortBy(
      raw.capabilities.map(({ id, mvp_feature_id, ...c }) => {
        const key = capKey.get(id)!
        return [key, stamp({ ...c, owner: mvp_feature_id === null ? null : mvpKey.get(mvp_feature_id) }, beforeCapKey.get(key))]
      }),
    ),
    featureMvpLinks: sortBy(
      raw.featureMvpLinks.map(({ mvp_feature_id, ...l }) => {
        const key = `${l.pwc_feature_id}|${mvpKey.get(mvp_feature_id)}`
        return [key, stamp(l, beforeMvpLinks.get(key))]
      }),
    ),
    featureCapabilityLinks: sortBy(
      raw.featureCapabilityLinks.map(({ id: _id, capability_id: _c, ...l }) => {
        const key = capLinkKey({ pwc_feature_id: l.pwc_feature_id, capability_id: _c })
        return [key, stamp(l, beforeCapLinks.get(key))]
      }),
    ),
  })
}

/** Runs both importers from the current state and compares everything. */
function compareImport() {
  const before = exportRawScope(db)
  const plan = planImport(
    { raw: before, now: utcNow(), sequences: exportSequences(db) },
    reconciled!,
  )
  const summary = importScope(reconciled!)
  expect(canonical(plan.result)).toEqual(canonical(summary))
  expect(byNaturalKey(plan.next, before)).toEqual(byNaturalKey(exportRawScope(db), before))
  return plan
}

describe.skipIf(!hasRealDb)('oracle — planImport matches importScope', () => {
  it('on a plain re-run over the real data', () => {
    compareImport()
  })

  it('twice in a row (idempotent on both sides)', () => {
    compareImport()
    compareImport()
  })

  it('after the edits the app makes: protected rows, notes, tombstones, decisions', () => {
    const raw = exportRawScope(db)
    const live = raw.featureCapabilityLinks.filter((l) => l.removed_at === null)
    const conflict = live.find((l) => l.release_conflict === 1)!
    const [f1, f2, f3] = raw.pwcFeatures.map((f) => f.id)
    const otherRelease = raw.releases.find((r) => r.id !== raw.pwcFeatures[0].release_id)!.id
    const mvpLinked = raw.featureMvpLinks.find((l) => l.removed_at === null)!

    // A renamed capability (manual), a moved one, and a question on a third.
    caps.updateCapability(raw.capabilities[0].id, { text: 'Renamed in the app' })
    caps.updateCapability(raw.capabilities[1].id, { release_id: otherRelease })
    caps.updateCapability(raw.capabilities[2].id, { question: 'Is this right?' })
    // A moved feature, edited notes, a question.
    features.updatePwcFeature(f1, { release_id: otherRelease })
    features.updatePwcFeature(f2, { notes: 'Edited in the app' })
    features.updatePwcFeature(f3, { question: 'Why here?' })
    // A decided conflict, a tombstoned capability link, a tombstoned MVP link.
    links.resolveConflict(conflict.id, 'table_wins', 'Decided')
    links.unlinkCapability(live[3].pwc_feature_id, live[3].capability_id)
    links.unlinkMvpFeature(mvpLinked.pwc_feature_id, mvpLinked.mvp_feature_id)
    // A manual release the sources will never name.
    releases.createRelease({ id: '9.9', label: 'Manual', name: '', description: '' })
    // A re-titled MVP record (manual).
    mvps.updateMvpFeature(raw.mvpFeatures[0].id, { title: 'Retitled' })

    compareImport()
  })

  it('re-creates imported rows that were deleted, with new ids', () => {
    const raw = exportRawScope(db)
    const cap = raw.capabilities.find((c) => c.source !== 'manual')!
    // Cascade-delete a capability and a feature, as the app's confirmed delete does.
    caps.deleteCapability(cap.id)
    features.deletePwcFeature(raw.pwcFeatures[5].id)

    const plan = compareImport()
    expect(Object.keys(plan.sequences)).toContain('capabilities')
  })

  it('sweeps stale MVP records: kept by a manual link, dropped with an imported one', () => {
    const feature = exportRawScope(db).pwcFeatures[0].id
    // Two imported records the sources do not produce.
    mvps.upsertImportedMvpFeature({ ref: 999001, scope_option: null, title: 'Stale, manual link', source: 'mapping' })
    mvps.upsertImportedMvpFeature({ ref: 999002, scope_option: null, title: 'Stale, imported link', source: 'mapping' })
    const kept = mvps.findMvpFeature(999001, null)!
    const dropped = mvps.findMvpFeature(999002, null)!
    links.linkMvpFeature(feature, kept.id) // manual
    links.upsertImportedFeatureMvpLink({ pwc_feature_id: feature, mvp_feature_id: dropped.id })

    const plan = compareImport()
    expect(plan.result.retainedStaleMvpFeatures).toContainEqual(
      expect.objectContaining({ ref: 999001 }),
    )
    expect(plan.result.removedMvpFeatures).toContainEqual({ ref: 999002, scope_option: null })
  })

  it('keeps a stale record a tombstoned manual link still points at', () => {
    const feature = exportRawScope(db).pwcFeatures[0].id
    mvps.upsertImportedMvpFeature({ ref: 999003, scope_option: null, title: 'Stale', source: 'mapping' })
    const record = mvps.findMvpFeature(999003, null)!
    links.linkMvpFeature(feature, record.id)
    links.unlinkMvpFeature(feature, record.id)
    compareImport()
  })

  it('from an empty store — the first import', () => {
    for (const table of [
      'pwc_feature_capabilities',
      'pwc_feature_mvp_features',
      'capabilities',
      'pwc_features',
      'mvp_features',
      'phases',
      'releases',
    ]) {
      db.exec(`DELETE FROM ${table}`)
    }
    compareImport()
  })
})
