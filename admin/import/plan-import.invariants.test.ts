import { beforeEach, describe, expect, it } from 'vitest'
import {
  planResolveConflict,
  planSetFeatureCapabilityLinks,
  planSetFeatureMvpLinks,
  planUpdateFeature,
  planUpdateRelease,
  type Plan,
  type PlanContext,
} from '@/lib/scope-plan'
import type { RawScope, Sequences } from '@/lib/scope-records'
import { assumptionsToMarkdown, planImport } from './plan-import.js'
import type { ReconcileResult } from './reconcile.js'
import { loadScopeFromSources } from './scope-source.js'

/**
 * The re-import half of server/repositories/scope-schema.test.ts and
 * notes-migration.test.ts, ported to the import planner.
 *
 * In SQLite these were the upserts' ON CONFLICT clauses, a CHECK on the id
 * and foreign keys on every placement. Now planImport is the only thing
 * between the source documents and the store, so each protection is pinned
 * here: an edit made in the app survives the next import (R-9.9, R-9.10,
 * R-11.4), and an import that would write a row the schema would have refused
 * is caught.
 *
 * Node-side, not in src/lib: the sources are read from _docs with node:fs.
 */

const T0 = '2026-09-01 00:00:00'
const T1 = '2026-10-08 09:00:00'
const T2 = '2026-10-09 09:00:00'

// Parsing the real documents is the slow part; every test re-plans from it.
const sources = loadScopeFromSources()

const empty = (): RawScope => ({
  releases: [],
  phases: [],
  pwcFeatures: [],
  mvpFeatures: [],
  capabilities: [],
  featureMvpLinks: [],
  featureCapabilityLinks: [],
})

let raw: RawScope
let sequences: Sequences

const ctx = (now: string): PlanContext => ({ raw, now, sequences })

function commit<T>(plan: Plan<T>): T {
  raw = plan.next
  sequences = { ...sequences, ...plan.sequences }
  return plan.result
}

const reimport = (result: ReconcileResult = sources) => commit(planImport(ctx(T2), result))

beforeEach(() => {
  raw = empty()
  sequences = { mvp_features: 0, capabilities: 0, pwc_feature_capabilities: 0 }
  // The first import, into an empty store.
  commit(planImport(ctx(T0), sources))
})

describe('re-import is an upsert, not an append', () => {
  it('upserts on the same (ref, scope_option) instead of duplicating', () => {
    const before = raw.mvpFeatures.length
    reimport()
    expect(raw.mvpFeatures).toHaveLength(before)
    const keys = raw.mvpFeatures.map((m) => `${m.ref}|${m.scope_option ?? ''}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps capabilities unique on (ref, case-insensitive text)', () => {
    reimport()
    const keys = raw.capabilities.map((c) => `${c.mvp_ref}|${c.text.toLowerCase()}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('provenance survives editing (R-9.9)', () => {
  it('never overwrites a manual feature on re-import', () => {
    const id = raw.pwcFeatures[0].id
    commit(planUpdateFeature(ctx(T1), id, { name: 'Renamed' }))
    reimport()
    expect(raw.pwcFeatures.find((f) => f.id === id)).toMatchObject({
      name: 'Renamed',
      source: 'manual',
    })
  })

  it('never overwrites a manual release', () => {
    const id = raw.releases[0].id
    commit(planUpdateRelease(ctx(T1), id, { name: 'Renamed' }))
    reimport()
    expect(raw.releases.find((r) => r.id === id)).toMatchObject({
      name: 'Renamed',
      source: 'manual',
    })
  })

  it('never overwrites a link whose conflict has been resolved (R-11.4)', () => {
    const conflict = raw.featureCapabilityLinks.find((l) => l.release_conflict === 1)!
    commit(
      planResolveConflict(ctx(T1), conflict.id, {
        resolution_state: 'defect_raised',
        resolution_note: 'raised',
      }),
    )
    reimport()
    expect(raw.featureCapabilityLinks.find((l) => l.id === conflict.id)).toMatchObject({
      resolution_state: 'defect_raised',
      resolution_note: 'raised',
      resolved_at: T1,
    })
  })
})

describe('a removed link stays removed (R-9.10)', () => {
  it('keeps a removed MVP link removed across a re-import', () => {
    const link = raw.featureMvpLinks[0]
    const others = raw.featureMvpLinks
      .filter((l) => l.pwc_feature_id === link.pwc_feature_id && l !== link)
      .map((l) => l.mvp_feature_id)
    commit(planSetFeatureMvpLinks(ctx(T1), link.pwc_feature_id, others))

    reimport()

    const after = raw.featureMvpLinks.filter(
      (l) => l.pwc_feature_id === link.pwc_feature_id && l.mvp_feature_id === link.mvp_feature_id,
    )
    // One row, still the tombstone — not revived, not re-inserted beside it.
    expect(after).toHaveLength(1)
    expect(after[0].removed_at).toBe(T1)
  })

  it('keeps a removed capability link removed across a re-import', () => {
    const link = raw.featureCapabilityLinks[0]
    const others = raw.featureCapabilityLinks
      .filter((l) => l.pwc_feature_id === link.pwc_feature_id && l !== link)
      .map((l) => l.capability_id)
    commit(planSetFeatureCapabilityLinks(ctx(T1), link.pwc_feature_id, others))

    reimport()

    const after = raw.featureCapabilityLinks.filter(
      (l) => l.pwc_feature_id === link.pwc_feature_id && l.capability_id === link.capability_id,
    )
    expect(after).toHaveLength(1)
    expect(after[0].removed_at).toBe(T1)
  })
})

describe('feature notes (formerly migration 011)', () => {
  it('renders assumptions as a numbered markdown list, in position order', () => {
    // Out of order on purpose: position, not arrival, is the order.
    expect(
      assumptionsToMarkdown([
        { position: 2, text: 'Second.' },
        { position: 1, text: 'First.' },
      ]),
    ).toBe('1. First.\n2. Second.')
  })

  it('leaves a feature with no assumptions empty', () => {
    expect(assumptionsToMarkdown([])).toBe('')
  })

  it('never overwrites notes edited in the app, nor freezes the rest of the row', () => {
    const id = raw.pwcFeatures[0].id
    commit(planUpdateFeature(ctx(T1), id, { notes: 'Edited in the app' }))
    reimport()
    expect(raw.pwcFeatures.find((f) => f.id === id)).toMatchObject({
      notes: 'Edited in the app',
      notes_edited: 1,
      source: 'mapping',
    })
  })
})

describe('what the schema refused on import', () => {
  /** The sources with one feature's id replaced everywhere it appears. */
  function withFeatureId(from: string, to: string): ReconcileResult {
    return JSON.parse(JSON.stringify(sources).replaceAll(`"${from}"`, `"${to}"`))
  }

  /**
   * pwc_features.id had CHECK (id GLOB 'F-[0-9][0-9][0-9]'). The mapping
   * parser accepts any `(F-\d+)`, so planImport checks the id against the
   * app's own FEATURE_ID_PATTERN before handing back a plan — a heading like
   * "(F-12)" or "(F-1000)" refuses the import instead of being stored.
   */
  it('refuses a feature id that is not F-nnn', () => {
    const id = sources.features[0].id
    for (const bad of ['F-12', 'F-1000']) {
      expect(() =>
        planImport({ raw: empty(), now: T0, sequences }, withFeatureId(id, bad)),
      ).toThrow(`feature id ${bad} is not F-nnn`)
    }
  })

  /**
   * pwc_features.release_id and capabilities.release_id were foreign keys to
   * releases. planImport now checks every reference resolves before it hands
   * back a plan (assertReferencesResolve), so a scope override with a
   * mistyped release cannot write a feature no package can draw.
   */
  it('refuses a feature whose release does not exist', () => {
    const result: ReconcileResult = structuredClone(sources)
    const id = result.features[0].id
    result.features[0] = { ...result.features[0], releaseId: 'nope' }
    expect(() => planImport({ raw: empty(), now: T0, sequences }, result)).toThrow(
      `Import refused — 1 reference(s) point at nothing: feature ${id} → release nope`,
    )
  })

  it('refuses a capability whose release does not exist', () => {
    const result: ReconcileResult = structuredClone(sources)
    result.capabilities[0] = { ...result.capabilities[0], releaseId: 'nope' }
    expect(() => planImport({ raw: empty(), now: T0, sequences }, result)).toThrow(
      /^Import refused — \d+ reference\(s\) point at nothing: .*capability \d+ → release nope/,
    )
  })
})
